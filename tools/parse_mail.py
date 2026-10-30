"""Parse Gmail print-view HTML threads into structured JSON."""
import json, re, sys, html
from lxml import html as LH

src, dst = sys.argv[1], sys.argv[2]
threads = json.load(open(src, encoding='utf-8'))

HE_MONTHS = {'בינו׳': 1, 'בינואר': 1, 'בפבר׳': 2, 'בפברואר': 2, 'במרץ': 3, 'באפר׳': 4, 'באפריל': 4, 'במאי': 5,
             'ביוני': 6, 'ביולי': 7, 'באוג׳': 8, 'באוגוסט': 8, 'בספט׳': 9, 'בספטמבר': 9, 'באוק׳': 10,
             'באוקטובר': 10, 'בנוב׳': 11, 'בנובמבר': 11, 'בדצמ׳': 12, 'בדצמבר': 12}


def parse_date(s):
    s = s.strip()
    m = re.match(r'(\d{1,2}) (\S+) (\d{4}) בשעה (\d{1,2}):(\d{2})', s)
    if m and m.group(2) in HE_MONTHS:
        d, mon, y, hh, mm = m.groups()
        return f'{y}-{HE_MONTHS[mon]:02d}-{int(d):02d}T{int(hh):02d}:{mm}'
    m = re.search(r'(\w{3}), (\w{3}) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)', s)
    if m:
        import datetime
        dt = datetime.datetime.strptime(' '.join(m.groups()[1:4]) + f' {m.group(5)}:{m.group(6)} {m.group(7)}', '%b %d %Y %I:%M %p')
        return dt.strftime('%Y-%m-%dT%H:%M')
    return None


def text_of(el):
    for br in el.xpath('.//br'):
        br.tail = '\n' + (br.tail or '')
    for div in el.xpath('.//div|.//p'):
        div.tail = '\n' + (div.tail or '')
    t = el.text_content()
    t = re.sub(r'[ \t ]+', ' ', t)
    t = re.sub(r'\n\s*\n\s*\n+', '\n\n', t)
    return t.strip()


out = []
for tid, raw in threads.items():
    doc = LH.fromstring(raw)
    subj = doc.xpath('string(//div[@class="maincontent"]/table[1]//font[@size="+1"])').strip()
    msgs = []
    for t in doc.xpath('//table[@class="message"]'):
        sender = t.xpath('string(.//tr[1]/td[1])').strip()
        date_raw = t.xpath('string(.//tr[1]/td[2])').strip()
        rec = [d.text_content().strip() for d in t.xpath('.//font[@class="recipient"]/div')]
        body_el = t.xpath('.//div[@style="overflow: hidden;"]')
        body, quoted = '', ''
        imgs = []
        if body_el:
            b = body_el[0]
            imgs = [i.get('src') for i in b.xpath('.//img') if i.get('src', '').startswith('?ui=2')]
            q = b.xpath('.//div[contains(@class,"gmail_quote")]|.//blockquote')
            if q:
                quoted = text_of(LH.fromstring(LH.tostring(q[0])))
                for qq in q:
                    if qq.getparent() is not None:
                        qq.getparent().remove(qq)
            body = text_of(b)
        atts = []
        for a in t.xpath('.//table[@class="att"]//table'):
            href = a.xpath('string(.//a/@href)')
            name = a.xpath('string(.//b)').strip()
            size = a.xpath('string(.//td[last()])').replace(name, '').strip()
            if href:
                atts.append({'name': name, 'size': size, 'href': href})
        msgs.append({'from': sender, 'date_raw': date_raw, 'date': parse_date(date_raw), 'recipients': rec,
                     'body': body, 'quoted': quoted, 'inline_images': imgs, 'attachments': atts})
    out.append({'thread_id': tid, 'subject': subj, 'messages': msgs})

json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for t in out:
    print(t['thread_id'], len(t['messages']), t['subject'][:60], [m['date'] for m in t['messages']][:3],
          sum(len(m['attachments']) + len(m['inline_images']) for m in t['messages']))
