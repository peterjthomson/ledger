import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import mac_artifacts as artifacts
import notarize


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_zip_names_with_spaces_and_nested_bundle_rejected(self):
        valid = self.root / 'valid.zip'
        with zipfile.ZipFile(valid, 'w') as archive:
            archive.writestr('Oh My Marktext.app/Contents/Info.plist', b'plist')
        self.assertEqual(artifacts.check_zip(valid), 'Oh My Marktext.app')
        nested = self.root / 'nested.zip'
        with zipfile.ZipFile(nested, 'w') as archive:
            archive.writestr('Ledger.app/Ledger.app/Contents/Info.plist', b'plist')
        with self.assertRaisesRegex(ValueError, 'nested bundle'):
            artifacts.check_zip(nested)

    def test_missing_feed_artifact_and_stale_legacy_digest_fail(self):
        asset = self.root / 'app.zip'
        asset.write_bytes(b'original release')
        feed = self.root / 'latest-mac.yml'
        feed.write_text(f'version: 1.0.0\nfiles:\n  - url: app.zip\n    sha512: {artifacts.digest(asset)}\n    size: {asset.stat().st_size}\npath: app.zip\nsha512: incorrect\n')
        with self.assertRaisesRegex(ValueError, 'legacy sha512'):
            artifacts.check_feed(feed)
        feed.write_text(feed.read_text().replace('sha512: incorrect', f'sha512: {artifacts.digest(asset)}'))
        artifacts.check_feed(feed)
        asset.unlink()
        with self.assertRaisesRegex(ValueError, 'missing artifact'):
            artifacts.check_feed(feed)

    def test_stapling_refreshes_legacy_and_file_digest(self):
        import subprocess
        import sys
        asset = self.root / 'App.dmg'
        asset.write_bytes(b'after stapling')
        feed = self.root / 'latest-mac.yml'
        feed.write_text('version: 1\nfiles:\n  - url: App.dmg\n    sha512: old\n    size: 1\npath: App.dmg\nsha512: old\n')
        subprocess.run([sys.executable, str(Path(__file__).with_name('refresh-feed.py')), str(feed), asset.name, str(asset)], check=True, capture_output=True)
        artifacts.check_feed(feed)

    def test_feed_multiple_artifacts_do_not_mix_checksums(self):
        first = self.root / 'app.zip'
        second = self.root / 'app.dmg'
        first.write_bytes(b'zip')
        second.write_bytes(b'disk image')
        feed = self.root / 'latest-mac.yml'
        feed.write_text('version: 1\nfiles:\n' + ''.join(
            f'  - url: {p.name}\n    sha512: {artifacts.digest(p)}\n    size: {p.stat().st_size}\n'
            for p in [first, second]))
        artifacts.check_feed(feed)
        second.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'stale checksum/size for app.dmg'):
            artifacts.check_feed(feed)

    def test_requested_missing_zip_fails_before_system_commands(self):
        from argparse import Namespace
        with self.assertRaisesRegex(ValueError, 'missing input'):
            artifacts.verify(Namespace(dmg=None, zip=self.root/'missing.zip', feed=None,
                                       bundle_id='com.example.app', version=None))

    def test_pending_notarization_cannot_staple(self):
        state = self.root / 'state.json'
        state.write_text(json.dumps({'app.zip': {'id': 'submission', 'path': '/unused'}}))
        with patch.object(notarize, 'STATE', state), patch.object(notarize, 'apple', return_value={'status': 'In Progress'}), patch.object(notarize.subprocess, 'run') as runner, patch('sys.argv', ['notarize', 'staple']), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(notarize.main(), 2)
            runner.assert_not_called()

    def test_changed_artifact_cannot_be_stapled(self):
        asset = self.root / 'App.dmg'
        asset.write_bytes(b'changed')
        state = self.root / 'state.json'
        state.write_text(json.dumps({'App.dmg': {'id': 'submission', 'path': str(asset), 'sha256': 'original'}}))
        with patch.object(notarize, 'STATE', state), patch.object(notarize, 'apple', return_value={'status': 'Accepted'}), patch('sys.argv', ['notarize', 'staple']), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, 'bytes changed'):
                notarize.main()


if __name__ == '__main__':
    unittest.main()
