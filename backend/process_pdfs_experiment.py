import sys
import json
import tempfile
import logging
from typing import Any, Dict, List

# Local imports from your project
from report_generator_text import generate_txt_report, generate_csv_report
from report_generator_pdf import generate_pdf_report

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _flatten(items_any: Any) -> List[Dict[str, Any]]:
    if not items_any:
        return []
    if (
        isinstance(items_any, list)
        and items_any
        and isinstance(items_any[0], dict)
        and "filePath" in items_any[0]
        and "items" in items_any[0]
    ):
        out: List[Dict[str, Any]] = []
        for grp in items_any:
            sub = grp.get("items") or []
            if isinstance(sub, list):
                out.extend(sub)
        return out
    return items_any if isinstance(items_any, list) else []


def _normalize(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    norm: List[Dict[str, Any]] = []
    for it in items or []:
        sf = it.get("sourceFile") or {}
        src = {
            "name": (sf.get("name") if isinstance(sf, dict) else None) or it.get("fileName") or "",
            "path": (sf.get("path") if isinstance(sf, dict) else None) or it.get("filePath") or "",
        }
        b64 = it.get("image_png_b64") or it.get("dataUrl") or ""
        grid = it.get("grid") or it.get("gridCoord") or ""
        norm.append({
            "text": it.get("text", ""),
            "composite_number": it.get("composite_number") or it.get("text", ""),
            "page": it.get("page"),
            "grid": grid,
            "image_png_b64": b64,
            "revision": it.get("revision"),
            "comment": it.get("comment", ""),
            "sourceFile": src,
        })
    return norm


def save_tmp(content: bytes | str, suffix: str) -> str:
    mode = "wb" if isinstance(content, (bytes, bytearray)) else "w"
    with tempfile.NamedTemporaryFile(mode=mode, suffix=suffix, delete=False, encoding=(None if mode=="wb" else "utf-8")) as f:
        f.write(content)
        return f.name


def main():
    if len(sys.argv) < 3:
        print("Usage: python process_pdfs_experiment.py <format: pdf|txt|csv> <payload.json>")
        sys.exit(1)

    format_ = sys.argv[1].lower()
    with open(sys.argv[2], "r", encoding="utf-8") as fh:
        payload = json.load(fh)

    options = payload.get("options", {})
    items = _normalize(_flatten(payload.get("items", [])))

    logger.info("Loaded %d items after normalize", len(items))

    if format_ == "pdf":
        out = generate_pdf_report(items, options)
        path = save_tmp(out, ".pdf")
    elif format_ == "txt":
        out = generate_txt_report(items, options)
        path = save_tmp(out, ".txt")
    elif format_ == "csv":
        out = generate_csv_report(items, options)
        path = save_tmp(out, ".csv")
    else:
        raise SystemExit(f"Unknown format: {format_}")

    print(path)


if __name__ == "__main__":
    main()
