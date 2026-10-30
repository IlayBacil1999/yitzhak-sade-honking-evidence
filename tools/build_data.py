"""Build site/data.js from the raw scrape (municipality portal + Gmail), with privacy redactions."""
import json, re, zipfile, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
SITE = os.path.join(ROOT, 'docs')

_red = os.path.join(RAW, 'redactions.json')
REDACTIONS = json.load(open(_red, encoding='utf-8')) if os.path.exists(_red) else {}

PH = 'media/photos/'
VID = 'media/videos/'


def redact(s):
    if not s:
        return s
    s = re.sub(r'\+?972[\s-]*5\d[\s-]*\d{3}[\s-]*\d{4}', '[טלפון הושמט]', s)
    s = re.sub(r'(?<!\d)0?5\d[\s-]?\d{3}[\s-]?\d{4}(?!\d)', '[טלפון הושמט]', s)
    # Names / addresses of private third parties live in raw/redactions.json (not committed): {"find": "replace"}.
    for find, repl in REDACTIONS.items():
        s = s.replace(find, repl)
    s = re.sub(r'Bcc:[^\n]*', 'Bcc: [נמען פרטי הושמט]', s)
    s = re.sub(r'(?<!\d)\d{9}(?!\d)', '[מספר הושמט]', s)
    return s


# ---------------------------------------------------------------- municipality portal (מוקד 106 / פניות ציבור)
muni = json.load(open(os.path.join(RAW, 'muni', 'inquiries.json'), encoding='utf-8'))
cards = {}
for c in muni['cards']:
    m = re.search(r'מספר פניה:\s*(\S+)', c)
    if not m:
        continue
    f = {}
    for key, lab in [('subject', None), ('opened', 'תאריך פתיחת פניה:'), ('status', 'סטטוס:'), ('type', 'סוג פניה:'),
                     ('source', 'מקור הפניה:'), ('dept', 'מחלקה מטפלת:'), ('street', 'רחוב:')]:
        if lab:
            mm = re.search(re.escape(lab) + r'\s*(.+)', c)
            f[key] = mm.group(1).strip() if mm else ''
    f['subject'] = c.split('\n')[0].strip()
    mm = re.search(r'תאריך עדכון סטטוס:\s*\n?(.+)', c)
    f['updated'] = mm.group(1).strip() if mm else ''
    cards[m.group(1)] = f

photos_by_case = {}
for p in sorted(glob.glob(os.path.join(SITE, 'media', 'photos', '*'))):
    b = os.path.basename(p)
    if '__' in b:
        photos_by_case.setdefault(b.split('__')[0], []).append(PH + b)

HONK = {'106-2609-14710', '106-2608-14547', '106-2603-15320', '106-2603-13806', '106-2511-21155', '106-2511-01882',
        '106-2510-20325', '106-2510-13822', '106-2507-33589', '106-2507-17648', '106-2505-06266',
        'PNZ-2609-00432', 'PNZ-2603-00479', 'PNZ-2603-00357'}
cases = []
for d in muni['details']:
    cid = d['CaseNumber']
    c = cards.get(cid, {})
    opened = c.get('opened', '')
    dd, tt = (opened.split(' ') + [''])[:2]
    iso = '-'.join(reversed(dd.split('/'))) + ('T' + tt if tt else '')
    cases.append({
        'id': cid, 'opened': iso, 'subject': c.get('subject', ''), 'status': c.get('status', ''),
        'type': c.get('type', ''), 'source': c.get('source', ''), 'dept': c.get('dept', ''),
        'street': c.get('street', ''), 'updated': c.get('updated', ''),
        'description': redact((d.get('CaseDescription') or '').strip()),
        'photos': photos_by_case.get(cid, []),
        'honk': cid in HONK,
    })
cases.sort(key=lambda x: x['opened'])

# ---------------------------------------------------------------- Gmail threads
mail = json.load(open(os.path.join(RAW, 'mail.json'), encoding='utf-8'))
att_files = {os.path.basename(p) for p in glob.glob(os.path.join(SITE, 'media', '*', '*'))}
DUP = {'198885e6566a8a08_0_1000225599.mp4': '19d288518b9a3fc9_0_WA_1773926831365.mp4',
       '19fc61f9049900ef_0_inline_0.jpg': '19d903eacad23474_2_inline_0.jpg'}
SKIP_THREADS = {'1a00dfedbad0cfad', '1a09f904e5a434b1'}  # duplicates of portal data are fine to keep; none skipped
docs = {}
for p in glob.glob(os.path.join(RAW, 'mail_att', '*.docx')):
    x = zipfile.ZipFile(p).read('word/document.xml').decode('utf-8')
    t = re.sub(r'</w:p>', '\n', x)
    t = re.sub(r'<w:tab/>', ' ', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    docs[os.path.basename(p)] = redact(t)


def kind_of(sender, body, subject):
    if 'guy.b944' in sender:
        return 'resident'
    if ('PniyotNR' in sender or 'TNUA' in sender or 'AnatS' in sender) and len(body) > 80:
        return 'reply'
    return 'ack'


emails = []
documents = []
for t in mail:
    for i, m in enumerate(t['messages']):
        rec = ' '.join(m['recipients'])
        if 'Draft' in rec or (not m['body'].strip() and not m['attachments'] and not m['inline_images']):
            continue
        media = []
        for a in m['attachments']:
            fn = f"{t['thread_id']}_{i}_{a['name']}"
            if a['name'].endswith('.docx'):
                documents.append({'date': m['date'], 'title': a['name'].replace('.docx', ''), 'text': docs.get(fn, ''),
                                  'thread': t['thread_id']})
                continue
            fn = DUP.get(fn, fn)
            if fn in att_files:
                media.append(('videos/' if fn.endswith('.mp4') else 'photos/') + fn)
        if 'guy.b944' in m['from']:
            for k, _ in enumerate(m['inline_images']):
                fn = DUP.get(f"{t['thread_id']}_{i}_inline_{k}.jpg", f"{t['thread_id']}_{i}_inline_{k}.jpg")
                if fn in att_files:
                    media.append('photos/' + fn)
        body = m['body']
        body = re.sub(r'\[Quoted text hidden\]', '', body).strip()
        emails.append({
            'id': f"{t['thread_id']}-{i}", 'thread': t['thread_id'], 'subject': t['subject'], 'date': m['date'],
            'from': redact(m['from']), 'to': redact(rec), 'body': redact(body),
            'media': ['media/' + x for x in media], 'kind': kind_of(m['from'], body, t['subject']),
        })
emails.sort(key=lambda e: e['date'])

json.dump({'cases': cases, 'emails': emails, 'documents': sorted(documents, key=lambda d: d['date'])},
          open(os.path.join(RAW, 'built.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- curated incident timeline
incidents = json.load(open(os.path.join(ROOT, 'tools', 'incidents.json'), encoding='utf-8'))
data = {'cases': cases, 'emails': emails, 'documents': sorted(documents, key=lambda d: d['date']),
        'incidents': incidents}
with open(os.path.join(SITE, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.CASE_DATA = ')
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write(';\n')
print(len(cases), 'cases', len(emails), 'emails', len(documents), 'docs', len(incidents), 'incidents')
# raw/private_terms.txt (not committed) lists strings that must never appear in the published data.
terms_file = os.path.join(RAW, 'private_terms.txt')
terms = [t.strip() for t in open(terms_file, encoding='utf-8')] if os.path.exists(terms_file) else []
published = open(os.path.join(SITE, 'data.js'), encoding='utf-8').read()
leaks = [t for t in terms if t and t in published]
print('LEAKS:', leaks)
