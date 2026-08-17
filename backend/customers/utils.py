import re


def normalize_phone(raw):
    """Telefon raqamni xalqaro +998XXXXXXXXX formatiga keltirish.

    Turli kiritish shakllarini qabul qiladi:
      +998 94 003 55 71, 998940035571, 94 003 55 71, 8 94 003 55 71
    Natija hech qachon noto'g'ri formatcha saqlanmaydi: digits-only + 998.
    """
    if not raw:
        return ""
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return ""
    if digits.startswith("998"):
        digits = digits[3:]
    elif digits.startswith("8"):
        digits = digits[1:]
    # 9 xonali local raqam (94 003 55 71) ga qadar
    digits = digits[-9:]
    return f"+998{digits}"
