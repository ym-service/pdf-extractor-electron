# -*- mode: python ; coding: utf-8 -*-

import os

if "__file__" in globals():
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
else:
    cwd = os.path.abspath(os.getcwd())
    BASE_DIR = cwd if os.path.basename(cwd).lower() == "backend" else os.path.join(cwd, "backend")


a = Analysis(
    [os.path.join(BASE_DIR, 'process_pdfs.py')],
    pathex=[BASE_DIR],
    binaries=[],
    datas=[
        (os.path.join(BASE_DIR, 'report_generator_pdf.py'), '.'),
        (os.path.join(BASE_DIR, 'report_generator_text.py'), '.'),
    ],
    hiddenimports=[
        'report_generator_pdf',
        'report_generator_text',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'easyocr', 'torchvision'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    exclude_binaries=True,
    name='process_pdfs',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# Добавлен блок COLLECT
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='process_pdfs'
)

