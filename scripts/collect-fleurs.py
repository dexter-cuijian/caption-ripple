"""Collect a small, attributed real-human test set without downloading all FLEURS.

Streams the official dev tar and stops after the requested audio duration. This
is evaluation tooling only; none of these transcripts enter production ASR.
"""
import argparse
import csv
import io
import json
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--language', default='cmn_hans_cn')
parser.add_argument('--seconds', type=int, default=330)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = root / '.work' / 'fixtures' / args.language
destination.mkdir(parents=True, exist_ok=True)
base = f'https://huggingface.co/datasets/google/fleurs/resolve/main/data/{args.language}'
table = subprocess.check_output(['curl', '-fLsS', '--retry', '2', '--max-time', '60', f'{base}/dev.tsv']).decode()
rows = {row[1]: row for row in csv.reader(io.StringIO(table), delimiter='\t')}
download = subprocess.Popen(['curl', '-fLsS', '--retry', '2', '--max-time', '600', f'{base}/audio/dev.tar.gz'], stdout=subprocess.PIPE)
samples = []
duration = 0
try:
    with tarfile.open(fileobj=download.stdout, mode='r|gz') as archive:
        for member in archive:
            name = Path(member.name).name
            if not member.isfile() or name not in rows:
                continue
            row = rows[name]
            data = archive.extractfile(member).read()
            (destination / name).write_bytes(data)
            seconds = int(row[5]) / 16000
            samples.append({'file': name, 'reference': row[2], 'normalized': row[3], 'seconds': seconds, 'speakerGender': row[6]})
            duration += seconds
            print(f'{args.language}: {len(samples)} files / {duration:.1f}s', flush=True)
            if duration >= args.seconds:
                break
finally:
    download.stdout.close()
    download.terminate()
    download.wait(timeout=10)
manifest = {'dataset': 'google/fleurs', 'split': 'validation (dev)', 'language': args.language,
            'license': 'CC-BY-4.0', 'source': base, 'seconds': duration, 'samples': samples}
(destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
if duration < args.seconds:
    raise SystemExit(f'Insufficient audio: {duration}s; partial manifest retained')
print(f'Collected {duration:.1f}s real human speech. Not news; report dataset separately.')
