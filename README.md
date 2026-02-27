## Diagnostic Error Sound VS Code Extension

Plays a short sound whenever there is at least one **error diagnostic** in the **currently active file**.

### Features

- **Watches VS Code diagnostics** for the active editor.
- **Plays a local audio file** (e.g. `media/error.mp3`) when errors are present.
- Uses **Node.js-compatible audio playback** via the `play-sound` package.
- Designed to work on **Windows, macOS, and Linux** (as long as a system audio player is available).

---

### Project Structure

- `package.json` – Extension manifest and scripts.
- `tsconfig.json` – TypeScript compiler configuration.
- `src/extension.ts` – Main extension code (`activate` / `deactivate` and diagnostics handling).
- `media/error.mp3` – Your error sound file (you provide this).

---

### Placing the Audio File

1. Create the `media` folder (if it does not already exist) at the root of the project:
   - Path: `media/`
2. Place your audio file inside this folder and name it **`error.mp3`**:
   - Path: `media/error.mp3`
3. You can also use a `.wav` file if you change the file name in `src/extension.ts` accordingly.

> The extension expects the file at `media/error.mp3` by default.

---

### Installing Dependencies

1. Open a terminal in the project root:

```bash
cd "/Users/shubhamkumarsingh/Desktop/ReactProject/ErrorVSCode Extention"
```

2. Install dependencies:

```bash
npm install
```

This will install `play-sound`, `typescript`, and the VS Code type definitions.

---

### Running the Extension in VS Code

1. Open the project folder in VS Code:
   - `File` → `Open Folder...` → select `ReactProject/ErrorVSCode Extention`.
2. Press **F5** or:
   - Open the **Run and Debug** view.
   - Choose **"Run Extension"** (VS Code may prompt you to configure it; accept the default).
3. VS Code will launch a new **Extension Development Host** window with the extension loaded.

---

### How It Works

- The extension listens to the **VS Code Diagnostics API**:
  - `vscode.languages.onDidChangeDiagnostics` to be notified when diagnostics change.
  - `vscode.languages.getDiagnostics(uri)` to read diagnostics for the active file.
- When the active file has at least one diagnostic with `DiagnosticSeverity.Error`, it:
  - Resolves the path to `media/error.mp3` inside the extension folder.
  - Uses the Node package **`play-sound`** to play the file.
- A small **debounce window** (1.5 seconds) prevents the sound from firing too frequently.

---

### Cross-Platform Notes

- `play-sound` acts as a lightweight wrapper around existing audio players:
  - macOS: typically uses `afplay`.
  - Linux: often uses `aplay`, `paplay`, `mplayer`, or similar.
  - Windows: can use `wmplayer`, `powershell`, or others.
- On some systems you may need to install a command-line audio player if one is not already available.

If the sound fails to play, a warning is logged to the **Extension Host** debug console in VS Code.

---

### Development Scripts

- **Build once**:

```bash
npm run compile
```

- **Watch mode** (recompile on change):

```bash
npm run watch
```

After rebuilding, stop and re-run the **"Run Extension"** debug session in VS Code to load the latest changes.

