@echo off
cd /d %~dp0

echo [*] Activating venv...
call .venv\Scripts\activate

echo [*] Upgrading build tools...
python -m pip install --upgrade pip setuptools wheel
python -m pip install --upgrade pyinstaller pyinstaller-hooks-contrib

echo [*] Installing deps (pin numpy)...
python -m pip install -r requirements.txt
python -m pip install "numpy==1.26.4" Pillow

echo [*] Cleaning...
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul
del /q app.spec 2>nul

echo [*] Building onefile...
python -m PyInstaller --clean --onefile --name app ^
  --add-data "models;models" ^
  --collect-all numpy ^
  --collect-all onnxruntime ^
  --collect-all onnxruntime_directml ^
  app.py

echo [*] Done. Check: %~dp0dist\app.exe
pause
