import csv
import io
import re
import os
from typing import List, Dict, Any, Optional, Tuple

# --------------------------
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# --------------------------
def _parse_revision_from_filename(file_name: str) -> Optional[int]:
    if not file_name:
        return None
    name_without_ext = os.path.splitext(os.path.basename(file_name))[0]
    matches = list(re.finditer(r"_r?(\d+)", name_without_ext))
    return int(matches[-1].group(1)) if matches else None

def _extract_file_core(file_name: str) -> str:
    if not file_name:
        return ""
    name = os.path.splitext(os.path.basename(file_name))[0]
    if name.upper().startswith("EST-"):
        name = name[4:]
    return next((part for part in name.split("_") if part), "")

def _build_identifier(file_name: str, options: Dict[str, Any]) -> str:
    core = _extract_file_core(file_name)
    letter_prefix = options.get("prefix", "W")
    return f"{core}{letter_prefix}" if core else ""

def _extract_number_digits(text_number: str) -> str:
    return re.sub(r"\D", "", text_number or "")

def _format_revision(file_name: str, rev_value: Optional[int]) -> str:
    if rev_value is None or rev_value == -1:
        rev_value = _parse_revision_from_filename(file_name)
    return f"{rev_value:02d}" if rev_value is not None else ""

# --------------------------
# TXT-ОТЧЁТ
# --------------------------
def generate_txt_report(items: List[Dict[str, Any]], options: Dict[str, Any]) -> str:
    rows: List[Tuple[str, str, str]] = []
    seen: set = set()

    for item in items:
        file_name = item.get("sourceFile", {}).get("name", "")
        if not file_name:
            continue

        identifier = _build_identifier(file_name, options)
        if not identifier:
            continue

        text_num = item.get("text", "")
        number_digits = _extract_number_digits(text_num)
        if not number_digits:
            continue

        rev_str = _format_revision(file_name, item.get("revision"))

        key = (identifier, number_digits, rev_str)
        if key in seen:
            continue
        seen.add(key)
        rows.append(key)

    def _sort_key(t: Tuple[str, str, str]):
        ident, num_str, rev = t
        try:
            num_int = int(num_str)
        except ValueError:
            num_int = 0
        return (ident, num_int, rev)

    rows.sort(key=_sort_key)

    return "\n".join(f"{ident}\t{num}\t{rev}" for ident, num, rev in rows)

# --------------------------
# CSV-ОТЧЁТ
# --------------------------
def generate_csv_report(items: List[Dict[str, Any]], options: Dict[str, Any]) -> str:
    """
    CSV с заголовком.
    По умолчанию: чистый CSV с разделителем ';'.
    Если options["excel_mode"] = True → Excel-friendly CSV (sep=; и Number/Revision как ="...").
    """
    excel_mode = bool(options.get("excel_mode", False))
    delimiter = ';'  # всегда ';' для Европы

    output = io.StringIO()
    if excel_mode:
        output.write("sep=;\n")

    writer = csv.writer(output, delimiter=delimiter, lineterminator='\n')
    writer.writerow(["Identifier", "Number", "Revision", "Page", "Coordinates", "Comment"])

    dedup = bool(options.get("dedup_csv", False))
    seen: set = set()

    def _should_skip(identifier: str, number_digits: str, rev_str: str) -> bool:
        if not dedup:
            return False
        key = (identifier, number_digits, rev_str)
        if key in seen:
            return True
        seen.add(key)
        return False

    for item in items:
        file_name = (item.get("sourceFile") or {}).get("name", "")
        if not file_name:
            continue

        identifier = _build_identifier(file_name, options)
        if not identifier:
            continue

        number_digits = _extract_number_digits(item.get("text", ""))
        rev_str = _format_revision(file_name, item.get("revision"))

        if _should_skip(identifier, number_digits, rev_str):
            continue

        if excel_mode:
            number_cell = f'="{number_digits}"' if number_digits != "" else ""
            revision_cell = f'="{rev_str}"' if rev_str != "" else ""
        else:
            number_cell = number_digits
            revision_cell = rev_str

        writer.writerow([
            identifier,
            number_cell,
            revision_cell,
            item.get("page", ""),
            item.get("grid", ""),
            item.get("comment", ""),
        ])

    return output.getvalue()
