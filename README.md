
# PDF Number Extractor — Electron (fully local)

This packages your HTML app into a Windows desktop app with Electron.
All heavy logic stays in the web UI.

## Quick Start (Windows 11)

1. Install Node.js LTS (currently 20.x or newer is recommended).
2. In PowerShell, navigate to the project directory:
   ```powershell
   cd C:\pdf-extractor-electron
   ```
3. Install the dependencies:
   ```powershell
   npm install
   ```
4. Run the application in development mode:
   ```powershell
   npm run dev
   ```
   This opens the app window.

## Build MSI installer
To create a distributable MSI installer, you first need to build the Python backend executable and then run the Electron builder.

1.  **Build the Python executable:**
    ```powershell
    npm run build:py
    ```
2.  **Build the MSI installer:**
    ```powershell
    npm run dist
    ```
    The output will be in the `dist/` folder.

## Notes
- **Offline First:** All required JavaScript libraries (`pdf.js`, `jsPDF`, `Tailwind CSS`) are vendored locally in the `Frontend/app/vendor/` directory to ensure the application works completely offline. There is no `postinstall` step.
- **Python Backend:** The core PDF processing logic is handled by a Python script, which is compiled into a standalone `.exe` by `pyinstaller` during the build process.

  Help / Instructions

1. Adding files
Click "Add files" or drag and drop PDFs into the area. File names are clickable - they will open in the viewer. Processing is local, nothing is uploaded anywhere.

2. Settings
Before analyzing, specify a prefix (e.g. "W" or "EST-P0"), enable revisioning and duplicate removal in CSV if needed.

3. Screenshots
Adjust the width, height and position of the text on the screenshot. The preview shows how the capture will look.

4. Analysis and export
Click "Run analysis". After processing, view the results. Clicking on the image will open the source PDF on the desired page. Export is available as a PDF report (A4), TXT list (unique) and CSV.
