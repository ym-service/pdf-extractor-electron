
# PDF Number Extractor – Electron (fully local)

Electron wraps the HTML/JS frontend and communicates with a Python backend that performs PDF parsing and OCR. Everything runs locally: there are no servers or cloud services involved.

## Editions

| Edition | Features | Typical size | Build command |
| --- | --- | --- | --- |
| **Lite** | Text extraction only, fast startup, minimal dependencies. | ~230 MB installer | `npm run dist:lite` |
| **Full (OCR)** | Includes EasyOCR + PyTorch binaries, can read rasterised drawings. | 5,5 Gb+ installer | `npm run dist:full` |

Both variants share the same UI. Full bundles the Lite backend plus an additional OCR executable; users can toggle OCR inside the app when the backend is present.
<img width="785" height="569" alt="image" src="https://github.com/user-attachments/assets/956a8d1f-069a-4edd-9430-a9745e388fde" />

## Quick Start (Windows 11)

1. **Install Node.js LTS** (20.x or newer).
2. **Open PowerShell** and change into the repository:
   ```powershell
   cd C:\pdf-extractor-electron
   ```
3. **Install JavaScript dependencies:**
   ```powershell
   npm install
   ```
4. **Start the development build:**
   ```powershell
   npm run dev
   ```
   This launches Electron with the Lite backend running directly from sources. Use this mode while editing UI code.

## Building the Python backends

The PDF processor is compiled with PyInstaller before packaging the app.

- **Lite backend (text-only):**
  ```powershell
  npm run build:py:no_ocr
  ```
- **OCR backend (EasyOCR + GPU/DirectML capable):**
  ```powershell
  npm run build:py:ocr
  ```

Running `npm run dist:full` will execute both commands automatically; `npm run dist:lite` only builds the text backend.

## Building installers

1. **Lite MSI (text-only):**
   ```powershell
   npm run dist:lite
   ```
2. **Full MSI (with OCR engine):**
   ```powershell
   npm run dist:full
   ```

Both scripts clean previous artifacts, rebuild the required Python executables, and then invoke Electron Builder with the corresponding config. The installers and unpacked builds are located inside the `dist/` directory.

## Notes

- **Offline first:** `pdf.js`, `jsPDF`, `Tailwind CSS` and other UI assets are vendored in `Frontend/app/vendor/`, so the application works without internet access and no `postinstall` script is required.
- **Python backend:** All PDF parsing, screenshot generation and OCR logic lives in `backend/`. PyInstaller bundles the scripts into `process_pdfs.exe` (Lite) and `backend_ocr.exe` (Full).
- **Configuration:** `electron-builder-lite.json` and `electron-builder-full.json` describe which backend executables are copied into the final package.

## Using the application

1. **Add files** – Click “Add files” or drag PDFs into the drop zone. The list displays previews; double‑click opens the source PDF.
2. **Adjust settings** – Choose the prefix (`W`, `EST-P0`, etc.), toggle revision filters and CSV deduplication. In the Full build you can enable OCR.
3. **Screenshot capture** – Use the sliders to position the text inside the preview rectangle; this controls the captured snippet around each match.
4. **Run analysis & export** – Press “Run analysis”. Once finished, inspect the results, open PDFs at the correct page, or export reports as PDF (A4 layout), TXT (unique values), or CSV.
