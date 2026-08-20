import { useEffect, useRef } from "react";

const FLAG = "🇺🇿";
const PREFIX = "+998";

/**
 * O'zbekiston telefon raqami maskali input.
 *
 * Masalan: +998 94 003 55 71  →  +998 94 003 55 71
 * +998 prefixi har doim ko'rinadi va o'chirib bo'lmaydi.
 * Har doim faqat raqamlar saqlanadi (normalize: +998940035571, + belgisiz 998940035571).
 *
 * @param {{
 *   value: string,
 *   onChange: (raw: string) => void,
 *   name?: string,
 *   required?: boolean,
 *   autoFocus?: boolean,
 *   placeholder?: string,
 *   className?: string,
 *   id?: string,
 * }} props
 */
export function PhoneInputMask({
  value,
  onChange,
  name,
  required,
  autoFocus,
  placeholder = "+998 90 123 45 67",
  className = "input",
  id,
}) {
  const inputRef = useRef(null);

  // value dan raqamlarni chiqaramiz
  const digits = String(value || "").replace(/\D/g, "");

  // Raqamlarni maskaga joylashtiramiz: +998 XX XXX XX XX
  // backend format: +998XXXXXXXXX (13 belgi: 1 + 12 raqam)
  const local = digits.startsWith("998") ? digits.slice(3) : digits.startsWith("8") ? digits.slice(1) : digits;
  const limited = local.slice(0, 9);

  let masked = PREFIX;
  if (limited.length > 0) masked += " " + limited.slice(0, 2);
  if (limited.length > 2) masked += " " + limited.slice(2, 5);
  if (limited.length > 5) masked += " " + limited.slice(5, 7);
  if (limited.length > 7) masked += " " + limited.slice(7, 9);

  // Backend kutgan formatga tyuring: +998 + 9 raqam
  const handleChange = (e) => {
    const raw = e.target.value;
    let rawDigits = raw.replace(/\D/g, "");
    // O'zimizga tegishli prefixni ('998' yoki '8') birinchi olib tashlaymiz —
    // qolgani lokl raqamlar. Prefix sohasini tahrirlashda (Backspace/typing)
    // "998" ikki marta yopishtirilib, qiymat 13-14 xonaga o'sib ketmasligi uchun.
    if (rawDigits.startsWith("998")) rawDigits = rawDigits.slice(3);
    else if (rawDigits.startsWith("8")) rawDigits = rawDigits.slice(1);
    // Ikkinchi ehtimoliy "998" qoldig'ini ham tozalaymiz va 9 xonaga cheklaymiz.
    rawDigits = rawDigits.replace(/^998/, "").slice(0, 9);
    const n = rawDigits ? "998" + rawDigits : "";
    onChange(n);
  };

  return (
    <div className="phone-input-wrap">
      <span className="phone-input-flag" aria-hidden="true">
        {FLAG}
      </span>
      <input
        ref={inputRef}
        id={id}
        className={`${className} phone-mask-input`}
        type="tel"
        inputMode="tel"
        name={name}
        value={masked}
        onChange={handleChange}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
      <style>{`
        .phone-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .phone-input-flag {
          position: absolute;
          left: 14px;
          font-size: 15px;
          pointer-events: none;
          z-index: 1;
          opacity: 0.95;
        }
        .phone-mask-input {
          padding-left: 44px !important;
        }
      `}</style>
    </div>
  );
}

export default PhoneInputMask;