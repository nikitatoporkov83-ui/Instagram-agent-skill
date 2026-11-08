#!/usr/bin/env python3
"""Portable entry point from Codex; never writes provider credentials to disk."""
import os
from pathlib import Path
import sys

MODULE = Path(__file__).resolve().parent
ROOT = MODULE.parents[1]
PYTHON = MODULE/'.venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python')

if not PYTHON.is_file():
    print('Сначала установите зависимости Instagram MCP по инструкции в README.md модуля.',file=sys.stderr)
    raise SystemExit(1)

os.environ.setdefault('INSTAGRAM_STUDIO_ROOT',str(ROOT))
os.environ.setdefault('INSTAGRAM_DATA_DIR',str(ROOT/'.instagram/mcp'))
os.environ.setdefault('INSTAGRAM_API_VERSION','v24.0')
module = 'instagram_mcp.check' if '--check' in sys.argv[1:] else 'instagram_mcp'
os.execv(str(PYTHON),[str(PYTHON),'-m',module])
