"""Opt-in load probe for a dedicated test deployment with pre-enrolled accounts."""
import argparse
import concurrent.futures
import json
import http.cookiejar
import statistics
import time
import urllib.request
import urllib.error
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest', type=Path)
    p.add_argument('--url', required=True)
    p.add_argument('--output', type=Path, default=Path('load-results.json'))
    p.add_argument('--confirm-test-environment', action='store_true', required=True)
    args = p.parse_args()
    accounts = json.loads(args.manifest.read_text(encoding='utf-8-sig'))['accounts']
    if len(accounts) != 30 or len({a['username'] for a in accounts}) != 30:
        p.error('Provide exactly 30 distinct test accounts')
    def participant(account):
        timings = {}
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def request(path, payload=None, token=None):
            headers = {'Content-Type': 'application/json', 'X-Oral-Client': 'desktop'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            req = urllib.request.Request(args.url.rstrip('/') + path,
                data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
            begin = time.monotonic()
            with opener.open(req, timeout=60) as response:
                result = json.load(response)
            timings[path] = round((time.monotonic()-begin)*1000, 2)
            return result
        try:
            auth = request('/auth/login', {'username':account['username'], 'password':account['password']})
            token = None
            request('/exams/available', token=token)
            created = request('/exam-sessions', {'exam_id':account['exam_id']}, token)
            request('/exam-sessions/' + created['id'], token=token)
            return {'success':True, 'timings_ms':timings}
        except urllib.error.HTTPError as exc:
            return {'success':False, 'http_status':exc.code, 'timings_ms':timings}
        except Exception as exc:
            return {'success':False, 'error_type':type(exc).__name__, 'timings_ms':timings}
    begin = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as pool:
        rows = list(pool.map(participant, accounts))
    summary = {}
    for path in {key for row in rows for key in row['timings_ms']}:
        values = sorted(row['timings_ms'][path] for row in rows if path in row['timings_ms'])
        summary[path] = {'samples':len(values), 'p50_ms':statistics.median(values), 'p95_ms':values[min(len(values)-1, int(len(values)*.95))]}
    report = {'participants':30, 'successful':sum(row['success'] for row in rows),
              'elapsed_seconds':round(time.monotonic()-begin,2), 'latency':summary, 'results':rows,
              'scope':'Login, list exams, enroll/create session, read session. Does not benchmark audio uploads or AI grading.'}
    args.output.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2))
    return int(report['successful'] != 30)

if __name__ == '__main__':
    raise SystemExit(main())
