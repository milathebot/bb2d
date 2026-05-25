#!/usr/bin/env python3
"""Compatibility wrapper.

The current Bb2D art pipeline is pack-only: runtime sprites, monuments,
buildings, ground, lake, garden plots, and composed map images are copied,
cropped, or tiled from the user-provided Super_Retro_Collection asset pack.
No custom SVG-generated gameplay/world assets are produced here.
"""
from pathlib import Path

script = Path(__file__).with_name('pack_only_assets.py')
exec(compile(script.read_text(), str(script), 'exec'))
