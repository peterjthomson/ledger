"""Checks the bytes that will be distributed, independently of the build tree."""
import argparse
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import subprocess
import tempfile
import zipfile


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def digest(path):
    return base64.b64encode(hashlib.sha512(path.read_bytes()).digest()).decode()


def scalar(value):
    value = value.strip()
    if value.startswith('"'):
        return json.loads(value)
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value


def check_feed(feed):
    text = feed.read_text()
    entries = re.findall(r'^[ \t]*- url: (.+)\n((?:[ \t]+[A-Za-z][^\n]*\n?)*)', text, re.M)
    if not entries:
        raise ValueError(f'{feed}: no artifact entries')
    seen = set()
    for name, fields in entries:
        name = scalar(name)
        if name in seen or Path(name).name != name:
            raise ValueError(f'{feed}: duplicate or nonlocal artifact {name}')
        seen.add(name)
        properties = dict(re.findall(r'^\s+(\w+):\s*(.+)$', fields, re.M))
        artifact = feed.parent / name
        if not artifact.is_file():
            raise ValueError(f'{feed}: missing artifact {name}')
        if (scalar(properties.get('sha512', '')) != digest(artifact)
                or int(properties.get('size', '-1')) != artifact.stat().st_size):
            raise ValueError(f'{feed}: stale checksum/size for {name}')
    path = re.search(r'^path: (.+)$', text, re.M)
    sha = re.search(r'^sha512: (.+)$', text, re.M)
    if path or sha:
        if not path or not sha or scalar(path[1]) not in seen:
            raise ValueError(f'{feed}: invalid legacy path/sha512')
        if scalar(sha[1]) != digest(feed.parent / scalar(path[1])):
            raise ValueError(f'{feed}: stale legacy sha512')


def check_zip(path):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        for name in names:
            parts = PurePosixPath(name).parts
            if name.startswith('/') or '..' in parts:
                raise ValueError(f'{path}: unsafe archive path {name}')
        roots = {n.split('/')[0] for n in names if n.split('/')[0].endswith('.app')}
        if len(roots) != 1:
            raise ValueError(f'{path}: expected exactly one root app')
        root = next(iter(roots))
        if f'{root}/Contents/Info.plist' not in names:
            raise ValueError(f'{path}: missing root app Contents/Info.plist (nested bundle?)')
        if f'{root}/{root}/Contents/Info.plist' in names:
            raise ValueError(f'{path}: nested duplicate app')
        return root


def verify_app(app, bundle_id, version):
    with (app / 'Contents/Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    if info.get('CFBundleIdentifier') != bundle_id:
        raise ValueError(f'{app}: unexpected bundle identifier')
    if version and info.get('CFBundleShortVersionString') != version:
        raise ValueError(f'{app}: unexpected app version')
    run('codesign', '--verify', '--deep', '--strict', str(app))
    signature = subprocess.run(['codesign', '-dv', '--verbose=2', str(app)],
                               check=True, capture_output=True, text=True).stderr
    if 'Authority=Developer ID Application:' not in signature:
        raise ValueError(f'{app}: not signed with Developer ID Application')
    run('xcrun', 'stapler', 'validate', str(app))
    run('spctl', '--assess', '--type', 'execute', '--verbose=2', str(app))
    print(f'PASS signature, notarization, Gatekeeper and identity: {app.name}')


def verify(args):
    if not args.dmg and not args.zip:
        raise ValueError('provide --dmg and/or --zip')
    for path in (args.dmg, args.zip, args.feed):
        if path and not path.is_file():
            raise ValueError(f'missing input: {path}')
    with tempfile.TemporaryDirectory(prefix='mac-artifact-') as temporary:
        work = Path(temporary)
        if args.zip:
            root = check_zip(args.zip)
            destination = work / 'zip'
            run('ditto', '-x', '-k', str(args.zip.resolve()), str(destination))
            app = destination / root
            run('xattr', '-w', 'com.apple.quarantine', '0081;00000000;ReleaseVerification;', str(app))
            verify_app(app, args.bundle_id, args.version)
        if args.dmg:
            copied = work / args.dmg.name
            run('ditto', str(args.dmg.resolve()), str(copied))
            run('xcrun', 'stapler', 'validate', str(copied))
            run('xattr', '-w', 'com.apple.quarantine', '0081;00000000;ReleaseVerification;', str(copied))
            run('spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', str(copied))
            mount = work / 'mount'
            run('hdiutil', 'attach', '-nobrowse', '-readonly', '-mountpoint', str(mount), str(copied))
            try:
                apps = list(mount.glob('*.app'))
                if len(apps) != 1:
                    raise ValueError('DMG must contain exactly one root app')
                # Verify the installed copy as well as the disk image itself.
                app = work / 'installed' / apps[0].name
                run('ditto', str(apps[0]), str(app))
                run('xattr', '-w', 'com.apple.quarantine', '0081;00000000;ReleaseVerification;', str(app))
                verify_app(app, args.bundle_id, args.version)
            finally:
                run('hdiutil', 'detach', str(mount))
    if args.feed:
        check_feed(args.feed)
        print('PASS update feed checksums and sizes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dmg', type=Path)
    parser.add_argument('--zip', type=Path)
    parser.add_argument('--feed', type=Path)
    parser.add_argument('--bundle-id', required=True)
    parser.add_argument('--version')
    try:
        verify(parser.parse_args())
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        parser.exit(1, f'verify: {error}\n{getattr(error, "stderr", "") or ""}')
    print('All artifact checks passed. Complete the native walkthrough before publication.')
