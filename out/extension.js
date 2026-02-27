"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
// `play-sound` has no official TypeScript types, so we import it via require.
// It uses common audio players available on each OS (afplay, aplay, mplayer, etc.).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const player = require("play-sound")({});
// Minimum delay between sound plays in milliseconds to avoid spamming.
const SOUND_DEBOUNCE_MS = 1500;
let lastPlayTime = 0;
let diagnosticsListenerDisposable;
let activeEditorListenerDisposable;
/**
 * Picks one of several configured sound files at random.
 * You can change or extend this list with your own filenames.
 */
function pickRandomErrorSoundFilename() {
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
function playErrorSound(context) {
    const now = Date.now();
    if (now - lastPlayTime < SOUND_DEBOUNCE_MS) {
        return;
    }
    lastPlayTime = now;
    const filename = pickRandomErrorSoundFilename();
    const soundPath = path.join(context.extensionPath, "media", filename);
    player.play(soundPath, (err) => {
        if (err) {
            // Swallow the error and show a warning once in the VS Code console output.
            console.warn("[Diagnostic Error Sound] Failed to play sound:", filename, err);
        }
    });
}
/**
 * Checks diagnostics for the given document URI and triggers a sound
 * if there is at least one error in that file.
 */
function handleDiagnosticsForUri(uri, context) {
    const allDiagnostics = vscode.languages.getDiagnostics(uri);
    const hasError = allDiagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
    if (hasError) {
        playErrorSound(context);
    }
}
/**
 * Sets up listeners to watch for diagnostics changes and active editor changes.
 */
function registerDiagnosticListeners(context) {
    // Listen for diagnostics changes in the workspace.
    diagnosticsListenerDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const activeUri = activeEditor.document.uri;
        // Only react if the active editor's URI is affected.
        const affectsActive = event.uris.some((uri) => uri.toString() === activeUri.toString());
        if (!affectsActive) {
            return;
        }
        handleDiagnosticsForUri(activeUri, context);
    });
    // Also check diagnostics when the active editor changes.
    activeEditorListenerDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) {
            return;
        }
        handleDiagnosticsForUri(editor.document.uri, context);
    });
}
/**
 * This method is called when your extension is activated.
 * Your extension is activated the very first time any of its activation events are triggered.
 */
function activate(context) {
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
function deactivate() {
    diagnosticsListenerDisposable?.dispose();
    diagnosticsListenerDisposable = undefined;
    activeEditorListenerDisposable?.dispose();
    activeEditorListenerDisposable = undefined;
    console.log('Extension "diagnostic-error-sound" has been deactivated.');
}
//# sourceMappingURL=extension.js.map