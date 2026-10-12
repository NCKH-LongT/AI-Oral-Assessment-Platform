"""Pure helper tests: no real desktop mutations or external dependencies."""
import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("display_gnome", Path(__file__).resolve().parents[1] / "apps/desktop/display-gnome.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class DisplaysTest(unittest.TestCase):
    def setUp(self):
        self.physical = [([connector, "vendor", "model", connector], [["1080p", 1920, 1080, 60., 1., [1.], {"is-current": True}]], {"display-name": connector}) for connector in ("A", "B")]
        self.logical = [(0, 0, 1., 0, True, [self.physical[0][0]], {}), (1920, 0, 1., 0, False, [self.physical[1][0]], {})]
        self.mutations = []

    def call(self, method, args=None):
        if method == "GetCurrentState":
            return (1, self.physical, self.logical, {"layout-mode": 1, "supports-changing-layout-mode": True})
        self.mutations.append(args)
        _, action, rows, _ = args
        if action == 1:
            self.logical = [(x, y, scale, transform, primary, [next(m[0] for m in self.physical if m[0][0] == o[0]) for o in outputs], {}) for x, y, scale, transform, primary, outputs in rows]
        return ()

    def handle(self, body):
        return helper.handle(body, self.call, lambda signature, value: value)

    def test_selected_secondary_becomes_only_output_then_exact_restore(self):
        original = self.handle({"action": "status"})["snapshot"]
        single = self.handle({"action": "single", "keep": "B", "expected": original})
        self.assertEqual([m["id"] for m in single["monitors"]], ["B"])
        self.assertEqual(single["snapshot"]["config"][0]["x"], 0)
        self.assertEqual([m[1] for m in self.mutations], [0, 1])
        restored = self.handle({"action": "restore", "snapshot": original, "expected": single["snapshot"]})
        self.assertEqual(restored["snapshot"], original)

    def test_stale_selection_and_unknown_output_do_not_mutate(self):
        state = self.handle({"action": "status"})["snapshot"]
        with self.assertRaises(ValueError):
            self.handle({"action": "single", "keep": "missing", "expected": state})
        with self.assertRaises(ValueError):
            self.handle({"action": "single", "keep": "A", "expected": {}})
        self.assertFalse(self.mutations)

    def test_restore_does_not_overwrite_manual_changes_or_different_hardware(self):
        original = self.handle({"action": "status"})["snapshot"]
        single = self.handle({"action": "single", "keep": "A", "expected": original})["snapshot"]
        self.mutations.clear()
        different = copy.deepcopy(original)
        different["config"][1]["outputs"][0]["identity"][3] = "another monitor"
        with self.assertRaises(ValueError):
            self.handle({"action": "restore", "snapshot": different, "expected": single})
        with self.assertRaises(ValueError):
            self.handle({"action": "restore", "snapshot": original, "expected": {}})
        self.assertFalse(self.mutations)


if __name__ == "__main__":
    unittest.main()
