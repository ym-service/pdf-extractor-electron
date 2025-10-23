import sys
import os
import base64
import io
import tempfile
import re
import json
import logging
from typing import List, Dict, Any, Optional

# --- Обязательная зависимость для analyze ---
try:
    import fitz  # PyMuPDF
except ImportError as e:
    print(f"Error: PyMuPDF is not installed. {e}\nPlease run 'pip install PyMuPDF'.", file=sys.stderr)
    sys.exit(1)

# -----------------------
# Логирование
# -----------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# -----------------------
# Модель опций
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
        # новый параметр — лимит цифр после префикса
        self.max_digits: int = int(data.get("max_digits", 5))

# -----------------------
# Утилиты
# -----------------------

def _parse_revision_from_filename(file_name: str) -> Optional[int]:
    if not file_name:
        return None
    name_without_ext = os.path.splitext(os.path.basename(file_name))[0]
    # --- ИЗМЕНЕНИЕ: Добавлена логика обработки префикса EST- ---
    if name_without_ext.upper().startswith("EST-"):
        name_without_ext = name_without_ext[4:]
    all_matches = list(re.finditer(r"_r?(\d+)", name_without_ext))
    return int(all_matches[-1].group(1)) if all_matches else None


def _get_file_prefix(file_name: str) -> str:
    if not file_name:
        return ""
    name = os.path.splitext(os.path.basename(file_name))[0]
    # --- ИЗМЕНЕНИЕ: Исправлена логика обработки префикса EST- ---
    if name.upper().startswith("EST-"):
        name = name[4:]
    return name.split('_')[0]


def _normalize_flat_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Приводим элементы к унифицированному виду, ожидаемому генераторами отчётов.
    """
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


def _flatten_items_structure(items_any: Any) -> List[Dict[str, Any]]:
    """Принимаем либо уже плоский список элементов, либо структуру
    [{filePath, items:[...]}, ...] и возвращаем плоский список элементов.
    """
    if not items_any:
        return []
    if isinstance(items_any, list) and items_any and isinstance(items_any[0], dict) \
            and "filePath" in items_any[0] and "items" in items_any[0]:
        out: List[Dict[str, Any]] = []
        for grp in items_any:
            sub = grp.get("items") or []
            if isinstance(sub, list):
                out.extend(sub)
        return out
    return items_any if isinstance(items_any, list) else []


# -----------------------
# Анализ PDF (логика сохранена)
# -----------------------

def analyze_single_pdf(file_path: str, options: AnalyzeOptions) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    file_name = os.path.basename(file_path)
    
    display_file_name = file_name
    if display_file_name.upper().startswith("EST-"):
        display_file_name = display_file_name[4:]

    revision = _parse_revision_from_filename(file_name)
    prefix = _get_file_prefix(file_name)

    number_pattern = re.compile(
        rf"\b{re.escape(options.prefix)}(?P<digits>\d{{1,{options.max_digits}}})(?!\d)"
    )

    try:
        doc: fitz.Document = fitz.open(file_path)
        for page_num in range(len(doc)):
            page: fitz.Page = doc[page_num]
            blocks = page.get_text("blocks")
            for blk in blocks:
                if len(blk) < 5:
                    continue
                x0, y0, x1, y1, text = blk[:5]
                if not isinstance(text, str) or not text:
                    continue

                for m in number_pattern.finditer(text):
                    digits = m.group("digits")
                    if not (1 <= len(digits) <= options.max_digits):
                        continue

                    found_text = f"{options.prefix}{digits}"
                    composite = f"{prefix}{found_text}"

                    instances = page.search_for(found_text, clip=fitz.Rect(x0, y0, x1, y1))
                    if not instances:
                        continue
                    
                    seen_rects = set()
                    for rect in instances:
                        key = (int(rect.x0), int(rect.y0), int(rect.x1), int(rect.y1))
                        if key in seen_rects:
                            continue
                        seen_rects.add(key)

                        center_x = (rect.x0 + rect.x1) / 2
                        center_y = (rect.y0 + rect.y1) / 2

                        cap_x0 = center_x - (options.cap_width * options.pos_x / 100.0)
                        cap_y0 = center_y - (options.cap_height * options.pos_y / 100.0)
                        cap_rect = fitz.Rect(cap_x0, cap_y0, cap_x0 + options.cap_width, cap_y0 + options.cap_height)

                        pix = page.get_pixmap(clip=cap_rect, dpi=150)
                        img_bytes = pix.tobytes("png")
                        img_b64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")

                        # --- НОВОЕ: Конвертируем координаты из пунктов в миллиметры ---
                        PT_TO_MM = 25.4 / 72.0
                        grid_x_mm = int(rect.x0 * PT_TO_MM)
                        grid_y_mm = int(rect.y0 * PT_TO_MM)

                        results.append({
                            "text": found_text,
                            "composite_number": composite,
                            "page": page_num + 1,
                            "grid": f"{grid_x_mm},{grid_y_mm}", # <-- Отправляем координаты в мм
                            "image_png_b64": img_b64,
                            "revision": revision,
                            "comment": "",
                            "sourceFile": {"name": display_file_name, "path": file_path}
                        })
        doc.close()
    except Exception as e:
        logger.error(f"Failed to process {file_name}: {e}")
    return results
# -----------------------
# Точка входа
# -----------------------

def main():
    sys.stdout.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print("Usage: python process_pdfs.py [command] [args...]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "analyze":
            try:
                options_payload = json.loads(sys.argv[2]) if len(sys.argv) >= 3 else {}
            except Exception as e:
                print(json.dumps(
                    {"error": True, "message": f"Invalid options JSON: {e}", "data": {"files": []}},
                    ensure_ascii=False
                ), flush=True)
                return

            options = AnalyzeOptions(options_payload)
            paths = sys.argv[3:] if len(sys.argv) >= 4 else []

            files_out = []
            for p in paths:
                try:
                    items = analyze_single_pdf(p, options)
                except Exception:
                    logger.exception(f"Analyze failed for {p}")
                    items = []
                files_out.append({"filePath": p, "items": items})

            print(json.dumps({"data": {"files": files_out}}, ensure_ascii=False), flush=True)
            return

        elif command == "export":
            raw = sys.stdin.read()
            try:
                payload = json.loads(raw) if raw else {}
            except Exception as e:
                print(json.dumps({"error": True, "message": f"Invalid export payload JSON: {e}"}), file=sys.stderr)
                sys.exit(1)

            options_dict: Dict[str, Any] = payload.get("options", {})
            items_dict: List[Dict[str, Any]] = payload.get("items", [])
            file_format: str = payload.get("format", "pdf").lower()

            flat_items = _flatten_items_structure(items_dict)
            norm_items = _normalize_flat_items(flat_items)

            if file_format == "pdf":
                from report_generator_pdf import generate_pdf_report  # type: ignore
                content = generate_pdf_report(norm_items, options_dict)
                suffix, mode = ".pdf", "wb"
            elif file_format == "txt":
                from report_generator_text import generate_txt_report  # type: ignore
                content = generate_txt_report(norm_items, options_dict)
                suffix, mode = ".txt", "w"
            elif file_format == "csv":
                from report_generator_text import generate_csv_report  # type: ignore
                content = generate_csv_report(norm_items, options_dict)
                suffix, mode = ".csv", "w"
            else:
                raise ValueError(f"Unknown export format: {file_format}")

            with tempfile.NamedTemporaryFile(
                mode=mode, suffix=suffix, delete=False,
                encoding=("utf-8" if mode == "w" else None)
            ) as tmp:
                tmp.write(content)
                print(tmp.name, flush=True)
            return

        else:
            raise ValueError(f"Unknown command: {command}")

    except Exception as e:
        logger.exception("Unhandled error")
        print(json.dumps({"error": True, "message": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

