from unittest import mock

from django.test import TestCase, override_settings

from shops.models import StoreApplication
from telegrambot.models import BotLog, BotSession, CustomerApplication
from telegrambot.telegram_api import inline_keyboard
from telegrambot.views import TelegramWebhookView

CHAT = 111
USERNAME = "ali_vali"


def run_message(view, text, chat_id=CHAT, username=USERNAME):
    return view.handle_message(
        chat_id=chat_id, text=text, username=username, from_user={}
    )


class CommandHandlerTests(TestCase):
    def setUp(self):
        self.view = TelegramWebhookView()

    def test_handler_methods_exist(self):
        for name in [
            "start_handler",
            "application_start_handler",
            "status_handler",
            "help_handler",
            "contact_handler",
        ]:
            self.assertTrue(hasattr(self.view, name), name)

    @mock.patch("telegrambot.views.send_message")
    def test_start_shows_welcome_and_menu(self, mock_send):
        run_message(self.view, "/start")
        text, kwargs = mock_send.call_args[0][1], mock_send.call_args[1]
        self.assertIn("Assalomu alaykum", text)
        self.assertIn("botiga xush kelibsiz", text)
        kb = kwargs["reply_markup"]["inline_keyboard"]
        flat = [b for row in kb for b in row]
        data = {b.get("callback_data") for b in flat}
        self.assertIn("store_start", data)
        self.assertIn("store_status", data)
        self.assertIn("help", data)
        self.assertIn("contact", data)
        self.assertNotIn("app_new", data)  # dublikat ariza tugmasi olib tashlandi

    @mock.patch("telegrambot.views.send_message")
    def test_application_starts_flow(self, mock_send):
        run_message(self.view, "/application")
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "name")
        text, kwargs = mock_send.call_args[0][1], mock_send.call_args[1]
        self.assertIn("Ismingizni", text)
        self.assertIn("inline_keyboard", kwargs["reply_markup"])

    @mock.patch("telegrambot.views.send_message")
    def test_status_without_applications(self, mock_send):
        run_message(self.view, "/status")
        text = mock_send.call_args[0][1]
        self.assertIn("mavjud emas", text)

    @mock.patch("telegrambot.views.send_message")
    def test_help(self, mock_send):
        run_message(self.view, "/help")
        text = mock_send.call_args[0][1]
        self.assertIn("KassaPro Bot yordam", text)
        self.assertIn("/application", text)
        self.assertIn("/contact", text)

    @mock.patch("telegrambot.views.send_message")
    def test_contact_uses_config_no_fake_phone(self, mock_send):
        run_message(self.view, "/contact")
        text = mock_send.call_args[0][1]
        self.assertIn("KassaPro bilan bog'lanish", text)
        self.assertIn("@uzb000777uz", text)
        self.assertNotIn("@@", text)  # handle faqat bitta '@' bilan
        self.assertNotIn("Telefon", text)  # CONTACT_PHONE o'rnatilmagan -> fake yo'q

    def test_main_keyboard_has_all_buttons(self):
        view = TelegramWebhookView()
        flat = [b for row in view._main_keyboard()["inline_keyboard"] for b in row]
        data = {b.get("callback_data") for b in flat}
        self.assertIn("store_start", data)  # eski do'kon flow ham saqlanadi


class ApplicationFlowTests(TestCase):
    def setUp(self):
        self.view = TelegramWebhookView()

    def _say(self, text):
        run_message(self.view, text)

    def _complete_to_confirm(self, phone="+998 90 123 45 67"):
        self._say("/application")
        self._say("Aliyev Alisher")
        self._say(phone)
        self._say("KassaPro haqida ma'lumot")
        self._say("Test izoh")
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "confirm")
        return session

    @mock.patch("telegrambot.views.send_message")
    @mock.patch("telegrambot.views.send_admin_notification", return_value=True)
    def test_full_flow_creates_application(self, mock_admin, mock_send):
        self._complete_to_confirm()
        # Tasdiqlash
        self.view.handle_callback(
            {"id": "q1", "data": "app_confirm", "from": {}, "message": {"chat": {"id": CHAT}}}
        )
        apps = CustomerApplication.objects.filter(telegram_user_id=CHAT)
        self.assertEqual(apps.count(), 1)
        app = apps.first()
        self.assertTrue(app.application_number.startswith("APP-"))
        self.assertEqual(app.full_name, "Aliyev Alisher")
        self.assertEqual(app.phone, "+998901234567")
        self.assertEqual(app.message, "KassaPro haqida ma'lumot")
        self.assertEqual(app.note, "Test izoh")
        # success xabar -> ariza raqami
        sent_texts = [c[0][1] for c in mock_send.call_args_list]
        self.assertTrue(any("muvaffaqiyatli yuborildi" in t for t in sent_texts))
        self.assertTrue(any("APP-000001" in t for t in sent_texts))
        # admin xabari professional
        admin_text = mock_admin.call_args[0][0]
        self.assertIn("YANGI ARIZA", admin_text)
        self.assertIn("APP-000001", admin_text)
        self.assertIn("Aliyev Alisher", admin_text)
        self.assertIn("+998901234567", admin_text)
        self.assertIn("KassaPro haqida ma'lumot", admin_text)
        self.assertIn("@ali_vali", admin_text)
        # estado reset
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "")
        self.assertEqual(session.app_name, "")

    @mock.patch("telegrambot.views.send_message")
    def test_duplicate_confirm_does_not_duplicate(self, mock_send):
        self._complete_to_confirm()
        self.view.handle_callback({"id": "q1", "data": "app_confirm", "from": {}, "message": {"chat": {"id": CHAT}}})
        self.view.handle_callback({"id": "q2", "data": "app_confirm", "from": {}, "message": {"chat": {"id": CHAT}}})
        self.assertEqual(CustomerApplication.objects.filter(telegram_user_id=CHAT).count(), 1)

    @mock.patch("telegrambot.views.send_message")
    def test_invalid_phone_keeps_stage(self, mock_send):
        self._say("/application")
        self._say("Aliyev Alisher")
        self._say("abc")
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "phone")
        self.assertEqual(session.app_phone, "")
        self.assertIn("Telefon raqam noto'g'ri", mock_send.call_args[0][1])

    @mock.patch("telegrambot.views.send_message")
    def test_empty_name_rejected(self, mock_send):
        self._say("/application")
        run_message(self.view, "   ")
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "name")
        self.assertEqual(session.app_name, "")

    @mock.patch("telegrambot.views.send_message")
    def test_cancel_clears_state(self, mock_send):
        self._say("/application")
        self._say("Aliyev Alisher")
        self.view.handle_callback({"id": "q1", "data": "app_cancel", "from": {}, "message": {"chat": {"id": CHAT}}})
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "")
        self.assertEqual(session.app_name, "")
        self.assertIn("bekor qilindi", mock_send.call_args[0][1])

    @mock.patch("telegrambot.views.send_message")
    def test_back_preserves_data(self, mock_send):
        self._say("/application")
        self._say("Aliyev Alisher")
        self._say("+998 90 123 45 67")
        # hozir stage = message; orqaga -> phone (oldingi bosqich), ma'lumot saqlanadi
        self.view.handle_callback({"id": "q1", "data": "app_back", "from": {}, "message": {"chat": {"id": CHAT}}})
        session = BotSession.objects.get(chat_id=CHAT)
        self.assertEqual(session.app_stage, "phone")
        self.assertEqual(session.app_name, "Aliyev Alisher")  # oldingi ma'lumot saqlandi
        self.assertEqual(session.app_phone, "+998901234567")

    @mock.patch("telegrambot.views.send_message")
    @mock.patch("telegrambot.views.send_admin_notification", return_value=False)
    def test_admin_failure_logs_not_hidden(self, mock_admin, mock_send):
        self._complete_to_confirm()
        self.view.handle_callback({"id": "q1", "data": "app_confirm", "from": {}, "message": {"chat": {"id": CHAT}}})
        # Arizaning o'zi saqlanadi, lekin xato logga yoziladi
        self.assertEqual(CustomerApplication.objects.filter(telegram_user_id=CHAT).count(), 1)
        self.assertTrue(BotLog.objects.filter(error__icontains="TELEGRAM_ADMIN_CHAT_ID").exists())


class StatusHandlerTests(TestCase):
    def setUp(self):
        self.view = TelegramWebhookView()

    def _mk(self, name="Ali", status=CustomerApplication.Status.NEW, note=""):
        return CustomerApplication.objects.create(
            telegram_user_id=CHAT,
            telegram_username=USERNAME,
            full_name=name,
            phone="+998901234567",
            message="Savol",
            note=note,
            status=status,
        )

    def test_single_application_shows_detail(self):
        self._mk()
        with mock.patch("telegrambot.views.send_message") as mock_send:
            self.view.status_handler(CHAT)
            text = mock_send.call_args[0][1]
            self.assertIn("Ariza holati", text)
            self.assertIn("APP-000001", text)
            self.assertIn("🟡 Yangi", text)

    def test_status_in_review_shows_blue(self):
        self._mk(status=CustomerApplication.Status.IN_REVIEW)
        with mock.patch("telegrambot.views.send_message") as mock_send:
            self.view.status_handler(CHAT)
            self.assertIn("🔵 Ko'rib chiqilmoqda", mock_send.call_args[0][1])

    def test_multiple_applications_list(self):
        self._mk(name="Ali")
        self._mk(name="Bek")
        with mock.patch("telegrambot.views.send_message") as mock_send:
            self.view.status_handler(CHAT)
            text, kwargs = mock_send.call_args[0][1], mock_send.call_args[1]
            self.assertIn("Arizalaringiz", text)
            kb = kwargs["reply_markup"]["inline_keyboard"]
            flat = [b for row in kb for b in row]
            data = {b.get("callback_data") for b in flat}
            self.assertTrue(any(d.startswith("app_detail:") for d in data))

    def test_detail_callback_only_own_application(self):
        app = self._mk()
        with mock.patch("telegrambot.views.send_message") as mock_send:
            self.view.handle_callback(
                {"id": "q1", "data": f"app_detail:{app.id}", "from": {}, "message": {"chat": {"id": CHAT}}}
            )
            self.assertIn("APP-000001", mock_send.call_args[0][1])
        other = self._mk(name="Boshqa")
        with mock.patch("telegrambot.views.send_message") as mock_send:
            # Boshqa user o'ziga tegishli bo'lmagan arizani ko'ra olmaydi
            self.view.handle_callback(
                {"id": "q2", "data": f"app_detail:{other.id}", "from": {}, "message": {"chat": {"id": 999}}}
            )
            self.assertIn("topilmadi", mock_send.call_args[0][1])


class BotAdminApiTests(TestCase):
    def setUp(self):
        from rest_framework.test import APITestCase

        from accounts.models import User

        self.admin = User.objects.create_user(
            username="super", password="xpass1", is_superuser=True
        )
        self.app = CustomerApplication.objects.create(
            telegram_user_id=CHAT,
            telegram_username=USERNAME,
            full_name="Ali",
            phone="+998901234567",
            message="Savol",
        )

    def test_non_admin_denied(self):
        from rest_framework.test import APIClient

        from accounts.models import User

        staff = User.objects.create_user(username="cashier", password="xpass1")
        c = APIClient()
        c.force_authenticate(user=staff)
        resp = c.get("/api/admin/bot-applications/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_list_patch_delete(self):
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_authenticate(user=self.admin)
        resp = c.get("/api/admin/bot-applications/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("APP-", resp.data["results"][0]["application_number"])

        resp = c.patch(
            f"/api/admin/bot-applications/{self.app.id}/",
            {"status": "in_review"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, CustomerApplication.Status.IN_REVIEW)

        resp = c.delete(f"/api/admin/bot-applications/{self.app.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(CustomerApplication.objects.filter(id=self.app.id).exists())


class OrderIndependentTests(TestCase):
    def test_application_model_generates_number_and_normalizes_phone(self):
        app = CustomerApplication.objects.create(
            telegram_user_id=1, full_name="Test", phone="+998 90 111 22 33", message="M"
        )
        self.assertTrue(app.application_number.startswith("APP-"))
        self.assertEqual(app.phone, "+998901112233")

    def test_session_isolation_per_chat(self):
        view = TelegramWebhookView()
        run_message(view, "/application", chat_id=CHAT)
        run_message(view, "/application", chat_id=222)
        s1 = BotSession.objects.get(chat_id=CHAT)
        s2 = BotSession.objects.get(chat_id=222)
        self.assertEqual(s1.chat_id, CHAT)
        self.assertEqual(s2.chat_id, 222)
        # birining state'i boshqasiga aralashmaydi
        run_message(view, "Ali Y", chat_id=CHAT)
        self.assertEqual(BotSession.objects.get(chat_id=222).app_stage, "name")
        self.assertEqual(BotSession.objects.get(chat_id=CHAT).app_stage, "phone")

    def test_contact_info_from_env(self):
        from telegrambot.telegram_api import contact_info

        info = contact_info()
        self.assertTrue(info["telegram"])
        self.assertTrue(info["website"])
        self.assertEqual(info["website"], "https://smartkassa-1.onrender.com")