import os
import site
import sys
from PyInstaller.utils.hooks import collect_dynamic_libs

# --- Torch DLLs ---
binaries = collect_dynamic_libs("torch")

for p in site.getsitepackages():
    torch_lib = os.path.join(p, "torch", "lib")
    if os.path.exists(torch_lib):
        for f in os.listdir(torch_lib):
            if f.endswith(".dll"):
                binaries.append((os.path.join(torch_lib, f), "."))

# --- PyWin32 ctypes fix ---
try:
    import pywin32_ctypes
    import win32api  # noqa: F401
    import pywintypes  # noqa: F401
except ImportError:
    sys.stderr.write("[WARN] pywin32-ctypes not available, OCR may fail on Windows.\n")