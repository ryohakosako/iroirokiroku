import json
from html.parser import HTMLParser
import os
import shutil
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '_site'
EXCLUDE = {'.git', '.github', '_site', '.venv', 'node_modules', '__pycache__'}

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
for item in ROOT.iterdir():
    if item.name in EXCLUDE:
        continue
    dest = OUT / item.name
    if item.is_dir():
        shutil.copytree(item, dest, ignore=shutil.ignore_patterns('__pycache__'))
    elif item.is_file():
        shutil.copy2(item, dest)

class TitleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.parts.append(data)


# アプリ名はルートのindex.htmlの<title>から取得する。
source_index = ROOT / 'index.html'
if not source_index.is_file():
    raise RuntimeError('ルートにindex.htmlが必要です')
parser = TitleParser()
parser.feed(source_index.read_text(encoding='utf-8-sig'))
app_name = ' '.join(''.join(parser.parts).split())
if not app_name:
    raise RuntimeError('index.htmlに<title>アプリ名</title>を設定してください')
(OUT / 'app-info.json').write_text(
    json.dumps({'name': app_name}, ensure_ascii=False, indent=2),
    encoding='utf-8'
)

repo = os.environ['GITHUB_REPOSITORY']
token = os.environ['GITHUB_TOKEN']
run_id = int(os.environ['GITHUB_RUN_ID'])
api = f'https://api.github.com/repos/{repo}/actions/workflows/deploy.yml/runs?event=push&branch=main&per_page=100'


def fetch(url):
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ryohaapp-version-builder',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)

runs = []
page = 1
while True:
    data = fetch(api + f'&page={page}')
    batch = data.get('workflow_runs', [])
    runs.extend(batch)
    if len(batch) < 100:
        break
    page += 1
    if page > 30:
        raise RuntimeError('実行履歴が3000件を超えました。履歴の保存方式を見直してください。')

# GitHub APIの履歴を、作成日時と実行IDの順に並べる。
runs.sort(key=lambda r: (r['created_at'], r['id']))
counts = {}
entries = []
for run in runs:
    created = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Tokyo'))
    date_key = created.strftime('%y.%m.%d')
    counts[date_key] = counts.get(date_key, 0) + 1
    message = ((run.get('head_commit') or {}).get('message') or '更新内容の記録なし').splitlines()[0].strip()
    entries.append({
        'version': f'v{date_key}.{counts[date_key]}',
        'updated': created.strftime('%Y/%m/%d'),
        'updatedAt': created.isoformat(timespec='seconds'),
        'message': message,
        'commit': (run.get('head_sha') or '')[:7],
        'commitUrl': f'https://github.com/{repo}/commit/{run["head_sha"]}',
        'runId': run['id'],
    })

current = next((e for e in entries if e['runId'] == run_id), None)
if current is None:
    raise RuntimeError('現在のプッシュ実行が履歴から見つかりません。mainへのpushで実行してください。')

# 出力JSONはWebサイトに公開される。トークンや秘密情報を入れない。
(OUT / 'version.json').write_text(json.dumps({k: current[k] for k in ('version', 'updated', 'updatedAt', 'commit')}, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT / 'changelog.json').write_text(json.dumps(list(reversed(entries)), ensure_ascii=False, indent=2), encoding='utf-8')
print('Version:', current['version'], 'History:', len(entries))
