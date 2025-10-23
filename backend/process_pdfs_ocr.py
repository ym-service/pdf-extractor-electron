# process_pdfs_ocr.py
import sys
import os
import re
import json
import logging
import base64
import io
from typing import List, Dict, Any, Optional

try:
    import fitz  # PyMuPDF
    from PIL import Image
except ImportError as e:
    print(f"Error: Required library is not installed. {e}\nPlease run 'pip install PyMuPDF Pillow'.", file=sys.stderr)
    sys.exit(1)

# --- OCR движок (EasyOCR) ---
from ocr_engine import NeuralOCREngine, rasterize_page, page_has_text

# -----------------------
# Логирование
# -----------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# -----------------------
# Опции анализа
# -----------------------
class AnalyzeOptions:
    def __init__(self, data: Dict[str, Any]):
        self.prefix: str = data.get("prefix", "W")
        self.include_revision: bool = data.get("include_revision", False)
        self.cap_width: int = data.get("screenshot_width", 200)
        self.cap_height: int = data.get("screenshot_height", 88)
        self.pos_x: int = data.get("text_pos_x", 30)
        self.pos_y: int = data.get("text_pos_y", 50)
        self.dedup_csv: bool = data.get("dedup_csv", False)
        self.max_digits: int = int(data.get("max_digits", 5))
        self.ocr_lang: str = data.get("ocr_lang", "en")

# -----------------------
# Утилиты для имени файла
# -----------------------
def _parse_revision_from_filename(file_name: str) -> Optional[int]:
    if not file_name:
        return None
    name_without_ext = os.path.splitext(os.path.basename(file_name))[0]
    if name_without_ext.upper().startswith("EST-"):
        name_without_ext = name_without_ext[4:]
    matches = list(re.finditer(r"_r?(\d+)", name_without_ext))
    return int(matches[-1].group(1)) if matches else None

def _get_file_prefix(file_name: str) -> str:
    if not file_name:
        return ""
    name = os.path.splitext(os.path.basename(file_name))[0]
    if name.upper().startswith("EST-"):
        name = name[4:]
    return name.split('_')[0]

# -----------------------
# Основной анализ с OCR
# -----------------------
def analyze_single_pdf(file_path: str, options: AnalyzeOptions, ocr: NeuralOCREngine) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    file_name = os.path.basename(file_path)

    display_file_name = file_name
    if display_file_name.upper().startswith("EST-"):
        display_file_name = display_file_name[4:]

    revision = _parse_revision_from_filename(file_name)
    prefix = _get_file_prefix(file_name)

    number_pattern = re.compile(rf"\b{re.escape(options.prefix)}(?P<digits>\d{{1,{options.max_digits}}})(?!\d)")

    try:
        doc = fitz.open(file_path)
        for page_num in range(doc.page_count):
            page = doc.load_page(page_num)
            
            # ===============================================================
            #  ПУТЬ 1: Обработка PDF с извлекаемым текстом (ИСПРАВЛЕНО)
            # ===============================================================
            if page_has_text(page):
                # --- НОВОЕ: Конвертируем пиксели из настроек в пункты ---
                DPI = 150  # DPI, с которым вы сохраняете превью
                PT_PER_INCH = 72.0
                
                cap_width_pt = (options.cap_width / DPI) * PT_PER_INCH
                cap_height_pt = (options.cap_height / DPI) * PT_PER_INCH
                # --- Конец нового блока ---

                text_blocks = page.get_text("blocks")
                for blk in text_blocks:
                    if len(blk) < 5:
                        continue
                    x0, y0, x1, y1, text_content = blk[:5]
                    
                    for m in number_pattern.finditer(text_content):
                        digits = m.group(1)
                        if not (1 <= len(digits) <= options.max_digits):
                            continue

                        found_text = f"{options.prefix}{digits}"
                        composite = f"{prefix}{found_text}"
                        
                        search_rects = page.search_for(found_text, clip=fitz.Rect(x0, y0, x1, y1))
                        
                        for rect in search_rects:
                            center_x = (rect.x0 + rect.x1) / 2
                            center_y = (rect.y0 + rect.y1) / 2

                            # ИСПОЛЬЗУЕМ КОНВЕРТИРОВАННЫЕ ЗНАЧЕНИЯ В ПУНКТАХ
                            cap_x0 = center_x - (cap_width_pt * options.pos_x / 100.0)
                            cap_y0 = center_y - (cap_height_pt * options.pos_y / 100.0)
                            cap_rect = fitz.Rect(cap_x0, cap_y0, cap_x0 + cap_width_pt, cap_y0 + cap_height_pt)

                            pix = page.get_pixmap(clip=cap_rect, dpi=DPI)
                            img_bytes = pix.tobytes("png")
                            crop_b64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")
                            
                            results.append({
                                "text": found_text, "composite_number": composite, "page": page_num + 1,
                                "image_png_b64": crop_b64, "revision": revision, "comment": "",
                                "sourceFile": {"name": display_file_name, "path": file_path}
                            })
                continue

            # ===============================================================
            #  ПУТЬ 2: Обработка PDF-картинки (С OCR, без изменений)
            # ===============================================================
            else:
                img = rasterize_page(page, dpi=400)
                ocr_blocks = ocr.ocr_image(img)

                for block in ocr_blocks:
                    for m in number_pattern.finditer(block["text"]):
                        digits = m.group(1)
                        if not (1 <= len(digits) <= options.max_digits):
                            continue

                        found_text = f"{options.prefix}{digits}"
                        composite = f"{prefix}{found_text}"

                        x_coords = [p[0] for p in block["bbox"]]
                        y_coords = [p[1] for p in block["bbox"]]
                        xmin, xmax = min(x_coords), max(x_coords)
                        ymin, ymax = min(y_coords), max(y_coords)

                        cx = (xmin + xmax) / 2
                        cy = (ymin + ymax) / 2
                        
                        cap_x0 = cx - (options.cap_width * options.pos_x / 100.0)
                        cap_y0 = cy - (options.cap_height * options.pos_y / 100.0)
                        cap_x1 = cap_x0 + options.cap_width
                        cap_y1 = cap_y0 + options.cap_height

                        cap_x0, cap_y0 = int(max(0, cap_x0)), int(max(0, cap_y0))
                        cap_x1, cap_y1 = int(min(img.width, cap_x1)), int(min(img.height, cap_y1))

                        cropped = img.crop((cap_x0, cap_y0, cap_x1, cap_y1))
                        buf = io.BytesIO()
                        cropped.save(buf, format="PNG")
                        crop_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
                        
                        results.append({
                            "text": found_text, "composite_number": composite, "page": page_num + 1,
                            "image_png_b64": crop_b64, "revision": revision, "comment": "",
                            "sourceFile": {"name": display_file_name, "path": file_path}
                        })
                        
        doc.close()
    except Exception as e:
        logger.error(f"Failed to process {file_path}: {e}")
    return results

# -----------------------
# Точка входа
# -----------------------
def main():
    sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) < 3:
        print("Usage: python process_pdfs_ocr.py analyze <options_json> <files...>", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == "analyze":
        try:
            options_payload = json.loads(sys.argv[2])
        except Exception as e:
            print(json.dumps(
                {"error": True, "message": f"Invalid options JSON: {e}", "data": {"files": []}},
                ensure_ascii=False
            ), flush=True)
            return

        options = AnalyzeOptions(options_payload)
        ocr = NeuralOCREngine(lang=options.ocr_lang)

        files_out = []
        for path in sys.argv[3:]:
            items = analyze_single_pdf(path, options, ocr)
            files_out.append({"filePath": path, "items": items})

        print(json.dumps({"data": {"files": files_out}}, ensure_ascii=False), flush=True)

    elif command == "export":
        raw = sys.stdin.read()
        try:
            payload = json.loads(raw) if raw else {}
        except Exception as e:
            print(json.dumps({"error": True, "message": f"Invalid export payload JSON: {e}"}), file=sys.stderr)
            sys.exit(1)

        options_dict = payload.get("options", {})
        items_dict = payload.get("items", [])
        file_format = payload.get("format", "pdf").lower()

        flat_items = _flatten_items_structure(items_dict)
        norm_items = _normalize_flat_items(flat_items)

        if file_format == "pdf":
            from report_generator_pdf import generate_pdf_report
            content = generate_pdf_report(norm_items, options_dict)
            suffix, mode = ".pdf", "wb"
        elif file_format == "txt":
            from report_generator_text import generate_txt_report
            content = generate_txt_report(norm_items, options_dict)
            suffix, mode = ".txt", "w"
        elif file_format == "csv":
            from report_generator_text import generate_csv_report
            content = generate_csv_report(norm_items, options_dict)
            suffix, mode = ".csv", "w"
        else:
            raise ValueError(f"Unknown export format: {file_format}")

        with tempfile.NamedTemporaryFile(
            mode=mode,
            suffix=suffix,
            delete=False,
            encoding=("utf-8" if mode == "w" else None)
        ) as tmp:
            tmp.write(content)
            print(tmp.name, flush=True)
        return

    else:
        print(json.dumps({"error": True, "message": f"Unknown command: {command}"}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
