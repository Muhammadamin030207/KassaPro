from unittest import mock

from django.test import TestCase

from shops.models import StoreApplication
from telegrambot.models import BotSession
from telegrambot.telegram_api import inline_keyboard
from telegrambot.views import TelegramWebhookView


class InlineKeyboardTests(TestCase):
    def test_helper_builds_markup(self):
        mk = inline_keyboard([[{"text": "A", "callback_data": "x"}], [{"text": "B", "url": "https://example.com"}]])
        self.assertEqual(len(mk["inline_keyboard"]), 2)
        self.assertEqual(mk["inline_keyboard"][0][0]["callback_data"], "x")
        self.assertEqual(mk["inline_keyboard"][1][0]["url"], "https://example.com")

    def test_start_keyboard_has_expected_buttons(self):
        view = TelegramWebhookView()
        kb = view._start_keyboard()["inline_keyboard"]
        flat = [b for row in kb for b in row]
        data = {b.get("callback_data") for b in flat}
        self.assertIn("start_application", data)
        self.assertIn("check_status", data)
        self.assertTrue(any("url" in b for b in flat))


class CallbackHandlerTests(TestCase):
    def _cb(self, data):
        return {
            "id": "qid1",
            "data": data,
            "from": {"username": "ali"},
            "message": {"chat": {"id": 111}},
        }

    def setUp(self):
        self.view = TelegramWebhookView()

    @mock.patch("telegrambot.views.send_message")
    def test_start_application_resets_step_and_prompts(self, mock_send):
        BotSession.objects.create(chat_id=111, step="phone", owner_name="Ali", store_name="Do'kon")
        resp = self.view.handle_callback(self._cb("start_application"))
        self.assertEqual(resp.status_code, 200)
        session = BotSession.objects.get(chat_id=111)
        self.assertEqual(session.step, "store_name")
        mock_send.assert_called_once()
        self.assertIn("Do'kon nomini yozing", mock_send.call_args[0][1])

    @mock.patch("telegrambot.views.send_message")
    def test_check_status_reports_pending(self, mock_send):
        StoreApplication.objects.create(
            store_name="Do'kon",
            owner_name="Ali",
            phone="+998901234567",
            telegram_chat_id=111,
            status=StoreApplication.Status.PENDING,
        )
        self.view.handle_callback(self._cb("check_status"))
        self.assertIn("Kutilmoqda", mock_send.call_args[0][1])

    @mock.patch("telegrambot.views.send_message")
    def test_check_status_without_application(self, mock_send):
        self.view.handle_callback(self._cb("check_status"))
        text, kwargs = mock_send.call_args[0][1], mock_send.call_args[1]
        self.assertIn("hali ariza", text)
        self.assertIn("inline_keyboard", kwargs["reply_markup"])

    @mock.patch("telegrambot.views.send_message")
    def test_unknown_callback_prompts_start(self, mock_send):
        self.view.handle_callback(self._cb("whatever"))
        self.assertIn("/start", mock_send.call_args[0][1])


class SendMessageMarkupTests(TestCase):
    @mock.patch("telegrambot.telegram_api._token", return_value="TOKEN")
    @mock.patch("urllib.request.urlopen")
    def test_send_message_includes_reply_markup(self, mock_urlopen, mock_token):
        import json

        from telegrambot.telegram_api import send_message

        mock_urlopen.return_value.__enter__.return_value.status = 200
        mock_urlopen.return_value.__enter__.return_value.read.return_value = b"{}"
        ok = send_message(42, "Salom", reply_markup={"inline_keyboard": []})
        self.assertTrue(ok)
        sent = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertEqual(sent["chat_id"], 42)
        self.assertIn("reply_markup", sent)
        self.assertEqual(sent["reply_markup"], {"inline_keyboard": []})