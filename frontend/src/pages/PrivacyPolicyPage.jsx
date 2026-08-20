import { Link } from "react-router-dom";

/**
 * Ommaviy shaxsiy ma'lumotlar siyosati (31-band spec talabi).
 * Real text — bemalol o'qish mumkin, yolg'on da'vo yo'q.
 */
export function PrivacyPolicyPage() {
  return (
    <div className="privacy-policy-page">
      <div className="privacy-policy-card panel">
        <div className="brand" style={{ marginBottom: 18 }}>
          <img src="/favicon.svg" alt="KassaPro" />
          <div>
            <h1>Maxfiylik siyosati</h1>
            <div className="sub">KassaPro — 2026</div>
          </div>
        </div>

        <p>
          Ushbu siyosat KassaPro tizimi (sayt, Telegram bot va mobil kassa
          ilovasi) foydalanuvchilarning qanday ma'lumotlarini yig'ishi va
          ulardan qanday foydalanishini tavsiflaydi.
        </p>

        <h3>1. Yig'iladigan ma'lumotlar</h3>
        <ul>
          <li>
            <b>Ariza ma'lumotlari:</b> Telegram orqali yoki sayt formasida
            yuborilgan do'kon arizasi — do'kon nomi, egasining ismi,
            telefon raqami va (ixtiyoriy) manzil.
          </li>
          <li>
            <b>Hisob ma'lumotlari:</b> admin tasdiqlagandan so'ng yaratilgan
            login (username) va parol (faqat hash ko'rinishida saqlanadi).
          </li>
          <li>
            <b>Telegram identifikatori:</b> bot sifatsiz xizmat ko'rsatish
            uchun ariza holatini yuborishda Telegram chat identifikatori.
          </li>
          <li>
            <b>Qurilma metadatalogi:</b> login qilingan qurilmalar haqidagi
            informatsion ma'lumot (qurilma turi, brauzer).
          </li>
        </ul>

        <h3>2. Ma'lumotlardan foydalanish</h3>
        <p>
          Yig'ilgan ma'lumotlar faqat quyidagi maqsadlarda ishlatiladi:
          (1) yangi do'kon arizalarini ko'rib chiqish va kredensiallarni
          Telegram orqali yetkazish; (2) kassa tizimining (mahsulotlar,
          savdolar, qarzdorlik) ishlashini ta'minlash; (3) texnik
          muammolarni aniqlash va xizmat sifatini yaxshilash. Ma'lumotlar
          uchinchi shaxslarga sotilmaydi va reklama maqsadida ishlatilmaydi.
        </p>

        <h3>3. Saqlash va himoya</h3>
        <p>
          Parollar hech qachon ochiq ko'rinishda saqlanmaydi — faqat
          kriptografik hash. Ma'lumotlar shifrlangan ulanish (HTTPS)
          orqali uzatiladi va faqat vakolatli adminlar ko'ra oladi.
          Savdo va qarz tarixi do'kon yopilgandan keyin ham arxiv sifatida
          saqlanadi.
        </p>

        <h3>4. Audit logi</h3>
        <p>
          Muhim admin amallari (arizani tasdiqlash/rad etish, do'konni
          yopish/qayta ochish) kim tomonidan va qachon bajarilganligi
          bilan qayd etiladi. Bu javobgarlik va xavfsizlikni ta'minlaydi.
        </p>

        <h3>5. Sizning huquqlaringiz</h3>
        <ul>
          <li>Shaxsiy ma'lumotlaringiz vositasida o'zgartirish va o'chirish so'rash;</li>
          <li>Ariza holatini Telegram orqali istalgan vaqt ko'rish;</li>
          <li>Hisobingizni deaktiv qilish (do'kon yopilganda).</li>
        </ul>

        <p className="muted small" style={{ marginTop: 18 }}>
          Savollar bo'lsa: Telegram orqali @KassaPro botga ariza qoldiring
          yoki sayt login sahifasidagi "Ariza qoldirish" formasidan
          foydalaning.
        </p>

        <Link to="/login" className="btn btn-primary btn-block" style={{ marginTop: 18 }}>
          ← Orqaga
        </Link>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;