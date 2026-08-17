from django.test import TestCase

from customers.utils import normalize_phone


class NormalizePhoneTest(TestCase):
    def test_various_formats(self):
        cases = {
            "+998 94 003 55 71": "+998940035571",
            "998940035571": "+998940035571",
            "94 003 55 71": "+998940035571",
            "8940035571": "+998940035571",
            "+998(94)003-55-71": "+998940035571",
            "": "",
            None: "",
        }
        for raw, expected in cases.items():
            self.assertEqual(normalize_phone(raw), expected)
