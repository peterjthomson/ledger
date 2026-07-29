"""Rewrite one artifact's sha512/size in an electron-builder update feed.

Called by notarize.sh after stapling: stapling appends the notarization ticket,
so the checksums electron-builder wrote before that point describe bytes that no
longer exist. electron-updater rejects a download whose checksum disagrees with
the feed, and nothing surfaces the mismatch until a user tries to update.
"""

import base64
import hashlib
import re
import sys

feed, name, path = sys.argv[1:4]
data = open(path, "rb").read()
sha = base64.b64encode(hashlib.sha512(data).digest()).decode()
size = len(data)

text = open(feed).read()
pattern = re.compile(r"(- url: %s\s*\n\s*sha512: )\S+(\s*\n\s*size: )\d+" % re.escape(name))
new, count = pattern.subn(lambda m: f"{m.group(1)}{sha}{m.group(2)}{size}", text)
if count and new != text:
    open(feed, "w").write(new)
    print(f"notarize: refreshed {name} checksums in {feed.split('/')[-1]}")
