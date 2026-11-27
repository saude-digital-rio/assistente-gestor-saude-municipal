"""Monta o ZIP de distribuição da extensão com manifest.json na raiz."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "manifest.json", "background.js", "core.js", "extractor.js",
    "popup.html", "popup.js", "progress.html", "progress.js",
    "sipni.js", "start.js", "style.css", "tabnet.js", "INSTALACAO.txt",
]


def main():
    version = json.loads((ROOT / "manifest.json").read_text())["version"]
    destination = ROOT / "dist" / f"assistente-gestor-saude-municipal-{version}.zip"
    destination.parent.mkdir(exist_ok=True)
    with ZipFile(destination, "w", ZIP_DEFLATED) as package:
        for name in FILES:
            package.write(ROOT / name, name)
        for icon in sorted((ROOT / "icons").iterdir()):
            if icon.is_file():
                package.write(icon, f"icons/{icon.name}")
    print(destination)


if __name__ == "__main__":
    main()
