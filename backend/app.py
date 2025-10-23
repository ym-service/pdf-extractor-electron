import sys
import os
import base64
import io
import tempfile
import re
import json
import logging
from typing import List, Dict, Any, Optional

try:
    import fitz  # PyMuPDF
    from PIL import Image  # noqa: F401
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
except ImportError as e:
    print(f"Error: A required library is not installed. {e}\nPlease run 'pip install PyMuPDF fpdf2 Pillow'.", file=sys.stderr)
    sys.exit(1)

from report_generator_pdf import generate_pdf_report
from report_generator_text import generate_txt_report, generate_csv_report

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

class AnalyzeOptions:
    def __init__(self, data: Dict[str, Any]):
        self.prefix: str = data.get("prefix", "W")
        self.include_revision: bool = data.get("include_revision", False)
        self.cap_width: int = data.get("cap_width", 200)
        self.cap_height: int = data.get("cap_height", 88)
        self.pos_x: int = data.get("pos_x", 30)
        self.pos_y: int = data.get("pos_y", 50)
        self.dedup_csv: bool = data.get("dedup_csv", False)

def _parse_revision_from_filename(file_name: str) -> Optional[int]:
    if not file_name:
        return None
    name_without_ext = os.path.splitext(os.path.basename(file_name))[0]
    all_matches = list(re.finditer(r"_r?(\d+)", name_without_ext))
    return int(all_matches[-1].group(1)) if all_matches else None

def _get_file_prefix(file_name: str) -> str:
    if not file_name:
        return ""
    name = os.path.splitext(os.path.basename(file_name))[0]
    if name.upper().startswith("EST-"):
        return name[:10]
    return name.split('_')[0]

class PDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, "PDF Extractor v0.31", align="L")
        self.set_x(self.w - self.r_margin - 10)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="R")

def analyze_single_pdf(file_path: str, options: AnalyzeOptions) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    file_name = os.path.basename(file_path)
    revision = _parse_revision_from_filename(file_name)
    prefix = _get_file_prefix(file_name)
    number_pattern = re.compile(rf"\\b{re.escape(options.prefix)}(\d{{1,6}}|\d{{8,}})")

    try:
        doc: fitz.Document = fitz.open(file_path)
        for page_num in range(len(doc)):
            page: fitz.Page = doc[page_num]
            blocks = page.get_text("blocks")
            for x0, y0, x1, y1, text, *_ in blocks:
                for match in number_pattern.finditer(text):
                    found_text = match.group(0)
                    composite = f"{prefix}{found_text}"
                    instances = page.search_for(found_text, clip=fitz.Rect(x0, y0, x1, y1))
                    if not instances:
                        continue
                    rect = instances[0]
                    center_x = (rect.x0 + rect.x1) / 2
                    center_y = (rect.y0 + rect.y1) / 2
                    cap_x0 = center_x - (options.cap_width * options.pos_x / 100.0)
                    cap_y0 = center_y - (options.cap_height * options.pos_y / 100.0)
                    cap_rect = fitz.Rect(cap_x0, cap_y0, cap_x0 + options.cap_width, cap_y0 + options.cap_height)
                    pix = page.get_pixmap(clip=cap_rect, dpi=150)
                    img_bytes = pix.tobytes("png")
                    img_b64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")
                    results.append({
                        "text": found_text,
                        "composite_number": composite,
                        "page": page_num + 1,
                        "grid": f"{int(rect.x0)},{int(rect.y0)}",
                        "image_png_b64": img_b64,
                        "revision": revision,
                        "comment": "",
                        "sourceFile": {"name": file_name, "path": file_path}
                    })
        doc.close()
    except Exception as e:
        logger.error(f"Failed to process {file_name}: {e}")
    return results

def main():
    if len(sys.argv) < 2:
        print("Usage: python app.py [command] [args...]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "export":
            raw = sys.stdin.read()
            try:
                payload = json.loads(raw) if raw else {}
            except Exception as e:
                print(json.dumps({"error": True, "message": f"Invalid export payload JSON: {e}"}), file=sys.stderr)
                sys.exit(1)

            # --- Debug log: печатаем что реально пришло от фронта ---
            logger.info("Payload from frontend: %s", json.dumps(payload, indent=2, ensure_ascii=False))

            options_dict: Dict[str, Any] = payload.get("options", {})
            items_dict: List[Dict[str, Any]] = payload.get("items", [])
            file_format: str = payload.get("format", "pdf").lower()

            # Flatten items если вложенная структура
            if items_dict and isinstance(items_dict[0], dict) and "filePath" in items_dict[0] and "items" in items_dict[0]:
                all_items = []
                for file_group in items_dict:
                    if isinstance(file_group.get("items"), list):
                        all_items.extend(file_group["items"])
                items_dict = all_items

            if file_format == "pdf":
                content_bytes = generate_pdf_report(items_dict, options_dict)
                suffix, mode, content = ".pdf", "wb", content_bytes
            elif file_format == "txt":
                content_text = generate_txt_report(items_dict, options_dict)
                suffix, mode, content = ".txt", "w", content_text
            elif file_format == "csv":
                content_text = generate_csv_report(items_dict, options_dict)
                suffix, mode, content = ".csv", "w", content_text
            else:
                raise ValueError(f"Unknown export format: {file_format}")

            with tempfile.NamedTemporaryFile(
                mode=mode, suffix=suffix, delete=False,
                encoding=("utf-8" if mode == "w" else None)
            ) as tmp:
                tmp.write(content)
                print(tmp.name, flush=True)
            return

        elif command == "analyze":
            print(json.dumps({"message": "analyze not modified in this debug build"}))
            return

        else:
            raise ValueError(f"Unknown command: {command}")

    except Exception as e:
        logger.exception("Unhandled error")
        print(json.dumps({"error": True, "message": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
