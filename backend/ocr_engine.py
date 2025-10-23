# ocr_engine.py
import numpy as np
from PIL import Image
import fitz  # PyMuPDF
import easyocr
import sys
import os

# --- Функция для определения пути к моделям ---
def get_model_path():
    """
    Определяет правильный путь к моделям EasyOCR,
    независимо от того, запущен скрипт в режиме разработки или как .exe.
    """
    if getattr(sys, 'frozen', False):
        # Если запущено как .exe (PyInstaller),
        # PyInstaller кладёт ресурсы в sys._MEIPASS
        return os.path.join(sys._MEIPASS, "easyocr", "model")
    else:
        # В режиме разработки EasyOCR будет использовать ~/.EasyOCR
        return None


# --- OCR движок ---
class NeuralOCREngine:
    def __init__(self, lang="en"):
        """
        lang: язык OCR (например 'en', 'ru', 'et')
        """
        model_directory = get_model_path()
        lang_list = [lang] if isinstance(lang, str) else list(lang)

        # Явно указываем путь к моделям
        self.reader = easyocr.Reader(
            lang_list,
            model_storage_directory=model_directory,
            user_network_directory=model_directory
        )

    def ocr_image(self, img: Image.Image):
        """
        Запускает OCR на изображении (PIL.Image).
        Возвращает список блоков с text/confidence/bbox.
        """
        np_img = np.array(img.convert("RGB"))
        results = self.reader.readtext(np_img)

        out = []
        for box, text, conf in results:
            out.append({
                "text": text,
                "confidence": float(conf),
                "bbox": box
            })
        return out


# --- Утилиты для PDF ---
def page_has_text(page: fitz.Page) -> bool:
    """ Проверка: есть ли встроенный текст на странице PDF """
    txt = (page.get_text("text") or "").strip()
    return len(txt) > 0


def rasterize_page(page: fitz.Page, dpi: int = 300) -> Image.Image:
    """ Рендер страницы PDF в PIL.Image для OCR """
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
