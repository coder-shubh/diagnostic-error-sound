import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * `play-sound` has no official TypeScript types, so we import it via require.
 * It shells out to common OS players (macOS: afplay, Linux: aplay/paplay, Windows: powershell/wmplayer, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const createPlayer = require("play-sound");

type PlayMode = "transition" | "increase" | "any";

let diagnosticsListenerDisposable: vscode.Disposable | undefined;
let activeEditorListenerDisposable: vscode.Disposable | undefined;
let configurationListenerDisposable: vscode.Disposable | undefined;
let taskProcessListenerDisposable: vscode.Disposable | undefined;

let outputChannel: vscode.OutputChannel | undefined;

// Tracks last-known error counts per document.
const lastErrorCountByUri = new Map<string, number>();

// Debounce tracking (global + per document).
let lastPlayAtGlobalMs = 0;
const lastPlayAtByUriMs = new Map<string, number>();

// Holds the current player instance (recreated if settings change).
let player: { play: Function } | undefined;

// Only show a “missing sound file” warning once per session.
let didWarnMissingSounds = false;

interface Settings {
  enabled: boolean;
  debounceMs: number;
  playMode: PlayMode;
  soundFiles: string[];
  preferredPlayer?: string;
}

let settings: Settings = {
  enabled: true,
  debounceMs: 1500,
  playMode: "transition",
  soundFiles: ["error.mp3", "error2.mp3", "error3.mp3"],
  preferredPlayer: undefined
};

/**
 * Logs to an OutputChannel (and console as a fallback).
 */
function log(message: string, ...args: unknown[]): void {
  const line =
    args.length > 0 ? `${message} ${args.map(String).join(" ")}` : message;

  if (!outputChannel) {
    console.log(line);
    return;
  }

  outputChannel.appendLine(line);
}

/**
 * Loads extension settings from VS Code configuration.
 */
function loadSettings(): void {
  const cfg = vscode.workspace.getConfiguration("diagnosticErrorSound");

  settings = {
    enabled: cfg.get<boolean>("enabled", true),
    debounceMs: Math.max(0, cfg.get<number>("debounceMs", 1500)),
    playMode: cfg.get<PlayMode>("playMode", "transition"),
    soundFiles: cfg.get<string[]>("soundFiles", [
      "error.mp3",
      "error2.mp3",
      "error3.mp3",
      "error4.mp3",
      "meme_sound.mp3",
      "tehelka_omelet_yeh_leh.mp3",
      "get_out_meme.mp3",
      "glup_glup_glup.mp3"
    ]),
    preferredPlayer: cfg.get<string | undefined>("player")
  };

  // Recreate the player if needed.
  const playerOptions =
    settings.preferredPlayer && settings.preferredPlayer.trim().length > 0
      ? { player: settings.preferredPlayer.trim() }
      : {};
  player = createPlayer(playerOptions);
}

/**
 * Resolves configured sound files to absolute paths and filters out missing files.
 *
 * Rules:
 * - Relative entries are resolved under `media/` in the extension folder.
 * - Absolute entries are used as-is.
 */
function resolveExistingSoundPaths(
  context: vscode.ExtensionContext
): string[] {
  const mediaDir = path.join(context.extensionPath, "media");
  const unique = new Set(settings.soundFiles);

  const resolved = [...unique].map((entry) => {
    const trimmed = (entry ?? "").trim();
    if (!trimmed) {
      return "";
    }
    return path.isAbsolute(trimmed) ? trimmed : path.join(mediaDir, trimmed);
  });

  return resolved.filter((p) => {
    if (!p) return false;
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * Randomly picks one existing sound path to play.
 */
function pickRandomExistingSoundPath(
  context: vscode.ExtensionContext
): { soundPath?: string; displayName?: string } {
  const candidates = resolveExistingSoundPaths(context);

  if (candidates.length === 0) {
    return {};
  }

  const idx = Math.floor(Math.random() * candidates.length);
  const soundPath = candidates[idx];
  return { soundPath, displayName: path.basename(soundPath) };
}

/**
 * Plays an error sound, safely:
 * - respects global + per-file debouncing
 * - checks sound file existence
 * - logs useful errors without crashing the extension host
 */
function playErrorSound(
  context: vscode.ExtensionContext,
  documentKey: string
): void {
  if (!settings.enabled) {
    return;
  }

  const now = Date.now();
  const lastDocPlay = lastPlayAtByUriMs.get(documentKey) ?? 0;

  const debounce = settings.debounceMs;
  if (debounce > 0) {
    if (now - lastPlayAtGlobalMs < debounce) return;
    if (now - lastDocPlay < debounce) return;
  }

  const { soundPath, displayName } = pickRandomExistingSoundPath(context);
  if (!soundPath) {
    if (!didWarnMissingSounds) {
      didWarnMissingSounds = true;
      const mediaDir = path.join(context.extensionPath, "media");
      vscode.window.showWarningMessage(
        `Diagnostic Error Sound: No sound files found. Add one of these under ${mediaDir}: ${settings.soundFiles.join(
          ", "
        )}`
      );
    }
    log(
      "[Diagnostic Error Sound] No sound files found. Expected one of:",
      settings.soundFiles.join(", ")
    );
    return;
  }

  try {
    if (!player) {
      loadSettings();
    }

    lastPlayAtGlobalMs = now;
    lastPlayAtByUriMs.set(documentKey, now);

    player!.play(soundPath, (err: unknown) => {
      if (err) {
        // Keep running even if playback fails (missing system player, unsupported format, etc.).
        log(
          "[Diagnostic Error Sound] Failed to play:",
          displayName ?? soundPath,
          err
        );
      } else {
        log("[Diagnostic Error Sound] Played:", displayName ?? soundPath);
      }
    });
  } catch (err) {
    log("[Diagnostic Error Sound] Unexpected playback error:", err);
  }
}

/**
 * Checks diagnostics for the given document URI and triggers a sound
 * depending on the selected play mode.
 */
function handleDiagnosticsForUri(
  uri: vscode.Uri,
  context: vscode.ExtensionContext
): void {
  if (!settings.enabled) {
    return;
  }

  // Only consider real file-like documents. This prevents odd edge cases with custom schemes.
  // (You can relax this later if you want sounds for e.g. "git:" docs.)
  if (uri.scheme !== "file" && uri.scheme !== "untitled") {
    return;
  }

  const allDiagnostics = vscode.languages.getDiagnostics(uri);
  const errorCount = allDiagnostics.filter(
    (d) => d.severity === vscode.DiagnosticSeverity.Error
  ).length;

  const key = uri.toString();
  const prevCount = lastErrorCountByUri.get(key) ?? 0;
  lastErrorCountByUri.set(key, errorCount);

  const shouldPlay = (() => {
    switch (settings.playMode) {
      case "any":
        return errorCount > 0;
      case "increase":
        return errorCount > 0 && errorCount > prevCount;
      case "transition":
      default:
        return prevCount === 0 && errorCount > 0;
    }
  })();

  if (shouldPlay) {
    playErrorSound(context, key);
  }
}

/**
 * Sets up listeners to watch for diagnostics changes and active editor changes.
 */
function registerDiagnosticListeners(
  context: vscode.ExtensionContext
): void {
  // Listen for diagnostics changes in the workspace.
  diagnosticsListenerDisposable = vscode.languages.onDidChangeDiagnostics(
    (event) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return;
      }

      const activeUri = activeEditor.document.uri;

      // Only react if the active editor's URI is affected.
      const affectsActive = event.uris.some(
        (uri) => uri.toString() === activeUri.toString()
      );
      if (!affectsActive) {
        return;
      }

      handleDiagnosticsForUri(activeUri, context);
    }
  );

  // Also check diagnostics when the active editor changes.
  activeEditorListenerDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (!editor) {
        return;
      }
      handleDiagnosticsForUri(editor.document.uri, context);
    }
  );

  // Reload settings on configuration changes.
  configurationListenerDisposable = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      if (e.affectsConfiguration("diagnosticErrorSound")) {
        loadSettings();
        log("[Diagnostic Error Sound] Settings reloaded.");
      }
    }
  );
}

/**
 * Sets up listeners for VS Code Tasks so we can play a sound
 * when a task process ends with a non‑zero exit code.
 *
 * Note: this only covers tasks run through the VS Code task system
 * (Run Task, npm script tasks, etc.), not arbitrary commands typed
 * directly into a regular terminal.
 */
function registerTaskListeners(context: vscode.ExtensionContext): void {
  taskProcessListenerDisposable = vscode.tasks.onDidEndTaskProcess(
    (event) => {
      const exitCode = event.exitCode;
      if (exitCode === undefined || exitCode === 0) {
        return;
      }

      const task = event.execution.task;
      const key = `task:${task.source}:${task.name}`;

      log(
        "[Diagnostic Error Sound] Task failed:",
        `${task.source}/${task.name}`,
        "exitCode=",
        exitCode
      );

      playErrorSound(context, key);
    }
  );
}

/**
 * This method is called when your extension is activated.
 * Your extension is activated the very first time any of its activation events are triggered.
 */
export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Diagnostic Error Sound");
  loadSettings();
  log('Extension "diagnostic-error-sound" is now active.');

  registerDiagnosticListeners(context);
  registerTaskListeners(context);

  // When the extension activates, immediately check the current active editor
  // for existing errors so the user gets feedback right away.
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    handleDiagnosticsForUri(activeEditor.document.uri, context);
  }
}

/**
 * This method is called when your extension is deactivated.
 * Clean up all disposables here.
 */
export function deactivate(): void {
  diagnosticsListenerDisposable?.dispose();
  diagnosticsListenerDisposable = undefined;

  activeEditorListenerDisposable?.dispose();
  activeEditorListenerDisposable = undefined;

  configurationListenerDisposable?.dispose();
  configurationListenerDisposable = undefined;

  taskProcessListenerDisposable?.dispose();
  taskProcessListenerDisposable = undefined;

  outputChannel?.dispose();
  outputChannel = undefined;

  // Clear state.
  lastErrorCountByUri.clear();
  lastPlayAtByUriMs.clear();
  didWarnMissingSounds = false;
  player = undefined;

  console.log('Extension "diagnostic-error-sound" has been deactivated.');
}

