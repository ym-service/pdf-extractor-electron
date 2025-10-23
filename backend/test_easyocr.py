import easyocr
import sys

def main():
    # Языки можно менять: ['en'], ['ru'], ['et'], ['en', 'ru']
    reader = easyocr.Reader(['en'])

    print("✅ EasyOCR initialized")

    # Если передан путь к картинке через аргументы
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        print(f"🔍 Analyzing image: {image_path}")
        results = reader.readtext(image_path)

        if not results:
            print("⚠️ No text detected.")
        else:
            print("📑 OCR results:")
            for box, text, confidence in results:
                print(f"- {text} (conf: {confidence:.2f})")
    else:
        print("ℹ️ No image path provided. Run: python test_easyocr.py path/to/image.png")

if __name__ == "__main__":
    main()
