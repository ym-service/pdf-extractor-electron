import base64
import io
import os
import re
import logging
from typing import List, Dict, Any, Optional

# --- Обязательные зависимости ---
try:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
except ImportError as e:
    sys.stderr.write(f"Error: fpdf2 library is not installed. {e}\nPlease run 'pip install fpdf2'.\n")
    sys.exit(1)

logger = logging.getLogger(__name__)

# --- Кастомный класс PDF с версией в футере ---
class PDF(FPDF):
    def __init__(self, orientation='P', unit='mm', format='A4', app_version='N/A'):
        super().__init__(orientation, unit, format)
        self.app_version = app_version

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        # Используем сохраненную версию приложения
        self.cell(0, 10, f"App Version: {self.app_version}", align="L")
        self.set_x(self.w - self.r_margin - 10)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="R")

# --- Утилиты ---
def _parse_revision_from_filename(file_name: str) -> Optional[int]:
    if not file_name: return None
    name_without_ext = os.path.splitext(file_name)[0]
    matches = list(re.finditer(r"_r?(\d+)", name_without_ext))
    return int(matches[-1].group(1)) if matches else None

def find_font_path() -> Optional[str]:
    return None

# --- Основная функция генерации PDF ---
def generate_pdf_report(items: List[Dict[str, Any]], options: Dict[str, Any]) -> bytes:
    # Извлекаем версию из опций и передаем ее в наш PDF класс
    app_version = options.get('app_version', 'N/A')
    pdf = PDF(orientation="P", unit="mm", format="A4", app_version=app_version)

    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=15)

    font_path = find_font_path()
    font_loaded = False
    try:
        if font_path:
            pdf.add_font("DejaVu", "", font_path)
            pdf.set_font("DejaVu", size=16)
            font_loaded = True
        else:
            raise RuntimeError("Custom font not found")
    except RuntimeError:
        pdf.set_font("Helvetica", size=16)

    def safe_text(text: str) -> str:
        return text if font_loaded else text.encode('latin-1', 'replace').decode('latin-1')

    pdf.add_page()
    page_width = pdf.w - 2 * pdf.l_margin
    pdf.cell(page_width, 10, safe_text("PDF Analysis Report"), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(5)

    col_index_w, col_image_w = 10, 50
    col_text_w = page_width - col_index_w - col_image_w

    def draw_header():
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(col_index_w, 7, safe_text("#"), border=1, align='C', fill=True)
        pdf.cell(col_image_w, 7, safe_text("Preview"), border=1, align='C', fill=True)
        pdf.cell(col_text_w, 7, safe_text("Details"), border=1, align='C', fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    draw_header()

    for i, item in enumerate(items):
        main_number = item.get("composite_number", item.get("text", ""))
        revision = item.get("revision")
        if revision is None or revision == -1:
            revision = _parse_revision_from_filename(item.get("sourceFile", {}).get("name", ""))

        rev_prefix = f"r{str(revision).zfill(2)} " if revision is not None else ""
        page_info = f"{rev_prefix}Page: {item.get('page', '')}, Grid: {item.get('grid', '')}"
        comment = f"Comment: {item.get('comment', '')}"

        pdf.set_font("Helvetica", "B", 12)
        h1 = pdf.multi_cell(col_text_w - 6, 5, safe_text(main_number), dry_run=True, output='HEIGHT')
        pdf.set_font("Helvetica", "", 9)
        h2 = pdf.multi_cell(col_text_w - 6, 5, safe_text(page_info), dry_run=True, output='HEIGHT')
        h3 = pdf.multi_cell(col_text_w - 6, 5, safe_text(comment), dry_run=True, output='HEIGHT')
        text_total_height = h1 + h2 + h3 + 6

        img_w = col_image_w - 2
        cap_width = options.get('cap_width', 200)
        cap_height = options.get('cap_height', 88)
        img_h = (img_w / cap_width) * cap_height if cap_width > 0 else 0
        row_height = max(img_h + 2, text_total_height)

        if pdf.get_y() + row_height > pdf.h - pdf.b_margin:
            pdf.add_page()
            draw_header()

        start_y = pdf.get_y()
        pdf.cell(col_index_w, row_height, "", border=1)
        pdf.cell(col_image_w, row_height, "", border=1)
        pdf.cell(col_text_w, row_height, "", border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Column 1: index
        pdf.set_xy(pdf.l_margin, start_y)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(col_index_w, row_height, str(i + 1), align='C')

        # Column 2: image
        try:
            base64_string = item.get("image_png_b64") or item.get("dataUrl", "")
            if not base64_string or ',' not in base64_string:
                raise ValueError("Invalid base64 data URL")
            img_data = base64.b64decode(base64_string.split(',', 1)[1])
            if not img_data:
                raise ValueError("Empty image data after decoding")

            img_stream: io.BytesIO = io.BytesIO(img_data)
            pdf.image(img_stream, x=pdf.l_margin + col_index_w + 1,
                        y=start_y + (row_height - img_h) / 2, w=img_w, h=img_h)
        except Exception as e:
            logger.error(f"Failed to process image for PDF report: {e}")
            pdf.set_xy(pdf.l_margin + col_index_w + 1, start_y + 1)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(255, 0, 0)
            pdf.multi_cell(col_image_w - 2, 4, safe_text(f"Image Error:\n{e}"))
            pdf.set_text_color(0, 0, 0)

        # Column 3: details
        details_x = pdf.l_margin + col_index_w + col_image_w
        pdf.set_xy(details_x + 3, start_y + 2)
        pdf.set_font("Helvetica", "B", 12)
        pdf.multi_cell(col_text_w - 6, 5, safe_text(main_number))

        pdf.set_x(details_x + 3)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(col_text_w - 6, 5, safe_text(page_info))
        pdf.set_x(details_x + 3)
        pdf.multi_cell(col_text_w - 6, 5, safe_text(comment))

        pdf.set_y(start_y + row_height)

    return pdf.output()

