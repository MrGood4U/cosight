from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files


PROJECT_ROOT = Path(SPEC).resolve().parents[1]
ABILITY_DATA = [
    (str(PROJECT_ROOT / "abilities" / "drawing" / "prompt.md"), "abilities/drawing"),
    (str(PROJECT_ROOT / "abilities" / "writing" / "prompt.md"), "abilities/writing"),
]
HIDDEN_IMPORTS = [
    "dashscope.audio",
    "dashscope.audio.qwen_omni",
]
DATA_FILES = (
    ABILITY_DATA
    + collect_data_files("dashscope")
    + collect_data_files("docx")
)


analysis = Analysis(
    [str(PROJECT_ROOT / "python" / "qwen_bridge.py")],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=DATA_FILES,
    hiddenimports=HIDDEN_IMPORTS,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="cosight-bridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="cosight-bridge",
)
