"""Regression checks for library writing and Markdown imports. Run with python -B tools/test_studio.py."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import studio


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patches = [patch.object(studio, "ROOT", self.root),
                        patch.object(studio, "NOTES", self.root / "notes"),
                        patch.object(studio, "run_command", return_value={"success": True, "stdout": "", "stderr": ""})]
        for item in self.patches:
            item.start()
        self.handler = object.__new__(studio.StudioHandler)

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def test_import_preserves_frontmatter_and_avoids_overwrite(self):
        original = '---\ntitle: "Research"\n---\n# Research\n\nExact source — **bold**.\n'
        request = {"section": "projects", "project": "New Project", "files": [{"name": "research.md", "content": original}]}
        first = self.handler.import_notes(request)
        second = self.handler.import_notes(request)
        self.assertTrue(first["success"])
        self.assertNotEqual(first["paths"], second["paths"])
        saved = (self.root / first["paths"][0]).read_text(encoding="utf-8")
        self.assertTrue(saved.startswith('---\ntitle: "Research"\n---\n'))
        self.assertEqual(saved.replace('<!-- tags: New Project -->\n', ''), original)

    def test_invalid_batch_writes_nothing(self):
        result = self.handler.import_notes({"section": "projects", "files": [{"name": "valid.md", "content": "# Fine"}, {"name": "bad.exe", "content": "No"}]})
        self.assertFalse(result["success"])
        self.assertFalse((self.root / "notes").exists())
        self.assertFalse(self.handler.import_notes({"section": "../outside", "files": [{"name": "a.md", "content": "x"}]})["success"])

    def test_note_save_keeps_project_and_existing_note(self):
        request = {"title": "A note", "section": "projects", "project": "Hod", "tags": ["Reference"], "body": "Original"}
        first = self.handler.save_note(request)
        request["body"] = "Another"
        second = self.handler.save_note(request)
        self.assertNotEqual(first["path"], second["path"])
        saved = (self.root / first["path"]).read_text(encoding="utf-8")
        self.assertIn('<!-- tags: Hod, Reference -->', saved)
        self.assertIn('Original', saved)


if __name__ == "__main__":
    unittest.main()
