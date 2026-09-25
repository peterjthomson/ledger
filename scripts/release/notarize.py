"""Resumable notarization; pending or invalid submissions cannot pass stapling."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

PROFILE = os.environ.get('APPLE_KEYCHAIN_PROFILE', 'AC_PASSWORD')
STATE = Path(os.environ.get('NOTARIZE_STATE', 'dist/.notarize-state.json')).resolve()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apple(*args):
    result = subprocess.run(['xcrun', 'notarytool', *args, '--keychain-profile', PROFILE,
                             '--output-format', 'json'], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def save(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(STATE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    submit = sub.add_parser('submit')
    submit.add_argument('--app', type=Path, help='App to staple when its submission ZIP is accepted')
    submit.add_argument('artifacts', nargs='+', type=Path)
    sub.add_parser('status')
    sub.add_parser('staple')
    log = sub.add_parser('log')
    log.add_argument('artifact')
    sub.add_parser('reset')
    args = parser.parse_args()
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    if args.command == 'reset':
        STATE.unlink(missing_ok=True)
        return
    if args.command == 'submit':
        if args.app and (len(args.artifacts) != 1 or args.artifacts[0].suffix != '.zip' or not args.app.is_dir()):
            raise ValueError('--app requires one submission ZIP and an existing app')
        for artifact in args.artifacts:
            artifact = artifact.resolve()
            fingerprint = sha(artifact)
            old = state.get(artifact.name)
            if old:
                if old.get('sha256') != fingerprint or old['path'] != str(artifact):
                    raise ValueError(f'{artifact.name}: recorded artifact differs; use a new state/output directory')
                print(f'{artifact.name}: already submitted as {old["id"]}; use status/log')
                continue
            if artifact.suffix == '.zip' and not args.app:
                raise ValueError('ZIP submissions require --app; ZIPs themselves cannot be stapled')
            result = apple('submit', str(artifact))
            state[artifact.name] = {'id': result['id'], 'path': str(artifact), 'sha256': fingerprint,
                                    'app': str(args.app.resolve()) if args.app else None,
                                    'submitted': datetime.datetime.now(datetime.timezone.utc).isoformat()}
            save(state)
            print(f'{artifact.name}: submitted as {result["id"]}')
        print(f'State: {STATE}\nRun status, then staple after acceptance.')
        return
    if not state:
        raise ValueError(f'No submissions in {STATE}')
    if args.command == 'log':
        entry = state[Path(args.artifact).name]
        subprocess.run(['xcrun', 'notarytool', 'log', entry['id'], '--keychain-profile', PROFILE], check=True)
        return
    incomplete = False
    for name, entry in state.items():
        status = apple('info', entry['id'])['status']
        print(f'{name}: {status}', flush=True)
        if status != 'Accepted':
            incomplete = True
            continue
        if args.command != 'staple':
            continue
        artifact = Path(entry['path'])
        if entry.get('sha256') and sha(artifact) != entry['sha256']:
            raise ValueError(f'{name}: bytes changed since submission/stapling')
        target = entry.get('app') or str(artifact)
        if target.endswith('.zip'):
            raise ValueError(f'{name}: legacy ZIP state has no app; staple its app explicitly')
        subprocess.run(['xcrun', 'stapler', 'staple', target], check=True)
        subprocess.run(['xcrun', 'stapler', 'validate', target], check=True)
        entry['sha256'] = sha(artifact)
        save(state)
        for feed in artifact.parent.glob('latest*.yml'):
            subprocess.run([sys.executable, str(Path(__file__).with_name('refresh-feed.py')),
                            str(feed), name, str(artifact)], check=True)
    if incomplete:
        print('Not all submissions are accepted. Keep this candidate and check again later.', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main() or 0)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f'notarize: {error}\n{getattr(error, "stderr", "") or ""}')
