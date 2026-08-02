import json, subprocess

BO = '/home/everdred/github/everdred/kevinweaver-dev/docs/build-orders/site-rewrite/build-order.json'
d = json.load(open(BO))

# Issues recreated to work around aiur-team/aiur#1454 (timeline > 64 KiB denies
# dispatch permanently). Old -> new. build-order.json still records the old ones.
REMAP = {'36': '88', '41': '89', '45': '90', '46': '91'}

closed = set(subprocess.run(
    ['gh', 'issue', 'list', '--repo', 'its-everdred/kevinweaver-dev',
     '--state', 'closed', '--limit', '80', '--json', 'number', '--jq', '.[].number'],
    capture_output=True, text=True).stdout.split())

num2id, id2num = {}, {}
for t in d['tickets']:
    n = str((t.get('github') or {}).get('number'))
    n = REMAP.get(n, n)
    num2id[n] = t['id']
    id2num[t['id']] = n

# a superseded issue is closed but its ticket is NOT done
superseded_old = set(REMAP.keys())
done = {num2id[n] for n in closed if n in num2id and n not in superseded_old}

print('DONE  :', ' '.join(sorted(done)) or '(none)')

ready, blocked = [], []
for t in d['tickets']:
    tid = t['id']
    n = id2num[tid]
    if n in closed:
        continue
    missing = [x for x in (t.get('depends_on') or []) if x not in done]
    row = (tid, n, t['complexity_points'], t['title'][:44], missing)
    (ready if not missing else blocked).append(row)

print(f'\nREADY ({len(ready)}):')
for tid, n, c, ti, _ in sorted(ready):
    print(f'  {tid} #{n} c{c} {ti}')

print(f'\nBLOCKED ({len(blocked)}):')
for tid, n, c, ti, missing in sorted(blocked):
    print(f'  {tid} #{n} waiting on {",".join(missing)}')
