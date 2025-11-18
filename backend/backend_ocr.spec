
import os
import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None
if "__file__" in globals():
    SPEC_DIR = os.path.abspath(os.path.dirname(__file__))
else:
    cwd = os.path.abspath(os.getcwd())
    SPEC_DIR = cwd if os.path.basename(cwd).lower() == "backend" else os.path.join(cwd, "backend")
BASE_DIR = SPEC_DIR


torch_hidden = collect_submodules("torch")
torch_data = collect_data_files("torch")
easyocr_hidden = collect_submodules("easyocr")
easyocr_data = collect_data_files("easyocr")


torch_lib_dir = r"C:\\pdf-extractor-electron\\backend\\.venv\\Lib\\site-packages\\torch\\lib"
torch_binaries = []
if os.path.exists(torch_lib_dir):
    for f in os.listdir(torch_lib_dir):
        if f.lower().endswith(".dll"):
            torch_binaries.append((os.path.join(torch_lib_dir, f), "torch/lib"))


a = Analysis(
    [os.path.join(BASE_DIR, "process_pdfs_ocr.py")], 
    pathex=[BASE_DIR],
    binaries=torch_binaries,
    datas=[
        (os.path.join(BASE_DIR, "easyocr_models", "craft_mlt_25k.pth"), "easyocr/model"),
        (os.path.join(BASE_DIR, "easyocr_models", "english_g2.pth"), "easyocr/model"),
        (os.path.join(BASE_DIR, "ocr_engine.py"), "."),
        (os.path.join(BASE_DIR, "report_generator_pdf.py"), "."),
        (os.path.join(BASE_DIR, "report_generator_text.py"), "."),
    ] + easyocr_data,
    hiddenimports=[        
        "easyocr",
        "torch",           
        "PIL",
        "cv2",
        "scipy",
        "skimage",
        "pywin32_ctypes",
        "win32ctypes.pywin32",        
        "report_generator_pdf",
        "report_generator_text",
        "ocr_engine",
    ] + torch_hidden + easyocr_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    noarchive=False,
    
    excludes=[
        # --- PyTorch ---
        'torch.utils.benchmark', 'torch.utils.tensorboard', 'tensorboard',
        'torch.jit.mobile',
        
        # --- OpenCV (cv2) --- НОВОЕ
        # Исключаем модули для работы с видео и камерами
        # 'cv2.cv2', # Часто дублируется
        # 'cv2.data',
        # 'cv2.gapi',
        # 'cv2.videoio',
        # 'cv2.videostab',
        # 'cv2.calib3d',
        # 'cv2.ml',
        # 'cv2.objdetect',
        # 'cv2.photo',
        # 'cv2.stitching',
        # 'cv2.video',

        # --- Scikit-image (skimage) --- НОВОЕ
        # 'skimage.color.tests',
        # 'skimage.data',
        # 'skimage.draw',
        # 'skimage.filters.tests',
        # 'skimage.graph',
        # 'skimage.io.tests',
        # 'skimage.transform.tests',

        # --- Другие зависимости ---
        'matplotlib', 'pandas', 'scipy.spatial.tests', 'numpy.core.tests',
        'PIL.ImageQt', 'tkinter'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,    
)


pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)


exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    exclude_binaries=True,
    name="backend_ocr",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='backend_ocr'
)

