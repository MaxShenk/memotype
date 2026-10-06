# Build a double-click Windows app: dist\MemoType.exe
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path .venv)) {
    # Python 3.11 includes Tcl/Tk on this machine. 3.12 was installed without it.
    py -3.11 -m venv .venv
}

$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $python -m pip install -r requirements.txt
& $python tools\make_icon.py
& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --windowed `
    --onefile `
    --name MemoType `
    --icon assets\icon.ico `
    --add-data "assets\icon.ico;assets" `
    --add-data "assets\decks;assets\decks" `
    --collect-all customtkinter `
    main.py

Write-Host "Built $(Join-Path $PSScriptRoot 'dist\MemoType.exe')"
