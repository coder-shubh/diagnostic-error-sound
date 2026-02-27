import * as path from "node:path";
import * as vscode from "vscode";

// `play-sound` has no official TypeScript types, so we import it via require.
// It uses common audio players available on each OS (afplay, aplay, mplayer, etc.).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const player = require("play-sound")({});

// Minimum delay between sound plays in milliseconds to avoid spamming.
const SOUND_DEBOUNCE_MS = 1500;

let lastPlayTime = 0;
let diagnosticsListenerDisposable: vscode.Disposable | undefined;
let activeEditorListenerDisposable: vscode.Disposable | undefined;

/**
 * Picks one of several configured sound files at random.
 * You can change or extend this list with your own filenames.
 */
function pickRandomErrorSoundFilename(): string {
  const candidates = [
    "error.mp3",
    "error2.mp3",
    "error3.mp3"
  ];

  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

/**
 * Plays an error sound from the extension's media folder, with simple debouncing.
 * Each call randomly chooses one of several sound files.
 */
function playErrorSound(context: vscode.ExtensionContext): void {
  const now = Date.now();
  if (now - lastPlayTime < SOUND_DEBOUNCE_MS) {
    return;
  }
  lastPlayTime = now;

  const filename = pickRandomErrorSoundFilename();
  const soundPath = path.join(context.extensionPath, "media", filename);

  player.play(soundPath, (err: unknown) => {
    if (err) {
      // Swallow the error and show a warning once in the VS Code console output.
      console.warn(
        "[Diagnostic Error Sound] Failed to play sound:",
        filename,
        err
      );
    }
  });
}

/**
 * Checks diagnostics for the given document URI and triggers a sound
 * if there is at least one error in that file.
 */
function handleDiagnosticsForUri(
  uri: vscode.Uri,
  context: vscode.ExtensionContext
): void {
  const allDiagnostics = vscode.languages.getDiagnostics(uri);
  const hasError = allDiagnostics.some(
    (d) => d.severity === vscode.DiagnosticSeverity.Error
  );

  if (hasError) {
    playErrorSound(context);
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
}

/**
 * This method is called when your extension is activated.
 * Your extension is activated the very first time any of its activation events are triggered.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Extension "diagnostic-error-sound" is now active.');

  registerDiagnosticListeners(context);

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

  console.log('Extension "diagnostic-error-sound" has been deactivated.');
}

