(function () {
  const D = window.CASE_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const fmtTime = (iso) => (iso && iso.length > 10 ? iso.slice(11, 16) : '');
  const isVideo = (p) => /\.mp4$/i.test(p);
  const isNight = (t) => { if (!t) return false; const h = +t.slice(0, 2); return h >= 22 || h < 6; };

  const casesById = Object.fromEntries(D.cases.map((c) => [c.id, c]));
  const mailById = Object.fromEntries(D.emails.map((m) => [m.id, m]));

  // Caption for every media file, taken from the event / case / email it belongs to.
  const caption = {};
  D.incidents.forEach((i) => (i.media || []).forEach((m) => { caption[m] = caption[m] || `${fmtDate(i.date)}${i.time ? ' · ' + i.time : ''} — ${i.title}`; }));
  D.cases.forEach((c) => c.photos.forEach((p) => { caption[p] = caption[p] || `${fmtDate(c.opened)} · ${fmtTime(c.opened)} — צורף לפנייה ${c.id}`; }));
  D.emails.forEach((e) => e.media.forEach((p) => { caption[p] = caption[p] || `${fmtDate(e.date)} · ${fmtTime(e.date)} — צורף למייל: ${e.subject}`; }));

  const incAnchor = {};
  D.incidents.forEach((i) => { let a = 'inc-' + i.date, n = 2; while (Object.values(incAnchor).includes(a)) a = `inc-${i.date}-${n++}`; incAnchor[D.incidents.indexOf(i)] = a; });

  function srcLink(s) {
    const [kind, id] = s.split(':');
    if (kind === 'case') return `<a href="#case-${esc(id)}">פנייה ${esc(id)}</a>`;
    const m = mailById[id];
    return `<a href="#mail-${esc(id)}">מייל ${m ? fmtDate(m.date) : ''}</a>`;
  }
  function thumbs(list) {
    if (!list || !list.length) return '';
    return `<div class="thumbs">${list.map((p) => `<button data-media="${esc(p)}" aria-label="פתח ${isVideo(p) ? 'סרטון' : 'תמונה'}">${isVideo(p)
      ? `<video src="${esc(p)}#t=0.5" preload="metadata" muted></video><span class="play">▶</span>`
      : `<img src="${esc(p)}" loading="lazy" alt="">`}</button>`).join('')}</div>`;
  }

  // ---------- stats
  const honks = D.incidents.filter((i) => i.type === 'honk');
  const nights = honks.filter((i) => i.night || isNight(i.time));
  const honkCases = D.cases.filter((c) => c.honk);
  const residentMails = D.emails.filter((e) => e.kind === 'resident' && e.date >= '2020');
  const years = new Set(honks.map((i) => i.date.slice(0, 4)));
  const nVideos = new Set(D.incidents.flatMap((i) => i.media || []).filter(isVideo)).size;
  $('#stats').innerHTML = [
    ['honk', honks.length, 'מועדים מתועדים של צפירות'],
    ['night', nights.length, 'מהם בשעות הלילה (22:00–06:00)'],
    ['official', honkCases.length + 1, 'פניות רשמיות לעירייה בנושא (106, פניות ציבור, מבקר העירייה)'],
    ['', residentMails.length, 'מיילים שנשלחו לגורמי העירייה'],
    ['official', 3, 'תשובות בכתב מלשכת ראש העירייה – הצפירות חזרו אחרי כל אחת'],
    ['', `${Math.min(...years)}–${Math.max(...years)}`, `תקופת התיעוד · ${nVideos} סרטונים, ${new Set(D.incidents.flatMap((i) => i.media || []).filter((p) => !isVideo(p))).size} תמונות`],
  ].map(([c, n, l]) => `<div class="stat ${c}"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('');

  // ---------- promises vs. reality
  const promises = D.incidents.filter((i) => i.type === 'promise');
  $('#promise-grid').innerHTML = promises.map((p, k) => {
    const next = promises[k + 1];
    const after = honks.filter((h) => h.date > p.date && (!next || h.date < next.date));
    const idx = D.incidents.indexOf(p);
    return `<article class="promise">
      <div class="said"><h4>מה העירייה כתבה</h4>
        <div><span class="date">${fmtDate(p.date)}</span> — <a href="#${incAnchor[idx]}">${esc(p.title)}</a></div>
        <blockquote>${esc(p.text)}</blockquote>
        <div class="src">${p.src.map(srcLink).join(' ')}</div></div>
      <div class="after"><h4>מה קרה אחר כך</h4>${after.length
        ? `<ul>${after.map((h) => `<li><a href="#${incAnchor[D.incidents.indexOf(h)]}"><b>${fmtDate(h.date)}${h.time ? ' ' + h.time : ''}</b></a> — ${esc(h.title)}</li>`).join('')}</ul>`
        : `<p class="none">${next ? '' : 'תשובה זו התקבלה ב-12/10/2026. התובע מדווח כי הצפירות נמשכות; תיעוד נוסף יתווסף.'}</p>`}</div>
    </article>`;
  }).join('');

  // ---------- timeline
  const TYPE = { honk: ['honk', 'צפירה'], promise: ['official', 'התחייבות העירייה'], response: ['official', 'תשובת העירייה'], quiet: ['quiet', 'תקופת שקט'], context: ['context', 'רקע'] };
  $('#tl').innerHTML = D.incidents.map((i, idx) => {
    const night = i.type === 'honk' && (i.night || isNight(i.time));
    const [tc, tl] = TYPE[i.type];
    const cls = [i.type, night ? 'night' : '', i.key ? 'key' : ''].join(' ');
    return `<li class="ev ${cls}" id="${incAnchor[idx]}" data-type="${i.type}" data-night="${night}">
      <div class="when"><span class="d">${fmtDate(i.date)}</span><span class="t">${esc(i.time || '')}</span></div>
      <div class="box">
        <span class="tag ${tc}">${tl}</span>${night ? '<span class="tag night">לילה</span>' : ''}${i.key ? '<span class="tag key">ראיה מרכזית</span>' : ''}
        <h3>${esc(i.title)}</h3>
        ${i.text ? `<p>${esc(i.text)}</p>` : ''}
        ${thumbs(i.media)}
        <div class="src">מקור: ${i.src.map(srcLink).join('')}</div>
      </div></li>`;
  }).join('');
  document.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach((x) => x.classList.toggle('on', x === b));
    const f = b.dataset.f;
    document.querySelectorAll('#tl .ev').forEach((li) => {
      const t = li.dataset.type, n = li.dataset.night === 'true';
      li.hidden = !(f === 'all' || (f === 'honk' && t === 'honk') || (f === 'night' && n) || (f === 'official' && (t === 'promise' || t === 'response')));
    });
  }));

  // ---------- cases table
  function renderCases() {
    const showOther = $('#show-other-cases').checked;
    $('#case-table tbody').innerHTML = D.cases.slice().reverse().filter((c) => c.honk || showOther).map((c) => `
      <tr id="case-${esc(c.id)}" class="${c.honk ? 'honk' : 'other'}">
        <td>${fmtDate(c.opened)}<br><small>${fmtTime(c.opened)}</small></td>
        <td class="id">${esc(c.id)}<br><small>${esc(c.type)}</small></td>
        <td>${esc(c.source)}<br><small>${esc(c.dept)}</small></td>
        <td class="desc">${c.description ? `<div class="clamp">${esc(c.description)}</div>${c.description.length > 220 ? '<button class="more">הצג הכול</button>' : ''}` : `<small>${esc(c.subject)} — תיאור לא נשמר באתר העירייה</small>`}</td>
        <td>${esc(c.status)}${c.updated ? `<br><small>עודכן ${esc(c.updated)}</small>` : ''}</td>
        <td>${thumbs(c.photos)}</td>
      </tr>`).join('');
  }
  $('#show-other-cases').addEventListener('change', renderCases);
  renderCases();
  $('#case-table').addEventListener('click', (e) => {
    if (!e.target.classList.contains('more')) return;
    const c = e.target.previousElementSibling; c.classList.toggle('open');
    e.target.textContent = c.classList.contains('open') ? 'צמצם' : 'הצג הכול';
  });

  // ---------- emails
  const KIND = { resident: 'התובע', reply: 'תשובת העירייה', ack: 'אישור קבלה אוטומטי' };
  function renderMail() {
    const showAck = $('#show-acks').checked;
    $('#mail-list').innerHTML = D.emails.filter((m) => showAck || m.kind !== 'ack').map((m) => `
      <details class="mail ${m.kind}" id="mail-${esc(m.id)}">
        <summary><span class="dt">${fmtDate(m.date)} · ${fmtTime(m.date)}</span>
          <span><span class="who">${esc(KIND[m.kind])}: ${esc(m.from.replace(/<.*>/, '').trim())}</span><span class="subj">${esc(m.subject)}</span></span></summary>
        <div class="body"><div class="hdr">מאת: ${esc(m.from)}<br>${esc(m.to)}</div><pre>${esc(m.body)}</pre>${thumbs(m.media)}</div>
      </details>`).join('');
  }
  $('#show-acks').addEventListener('change', renderMail);
  renderMail();

  // ---------- documents
  $('#doc-list').innerHTML = D.documents.map((d) => `<details class="doc"><summary>${fmtDate(d.date)} — ${esc(d.title)}</summary><pre>${esc(d.text)}</pre></details>`).join('');

  // ---------- gallery
  const allMedia = [...new Set([...D.incidents.flatMap((i) => i.media || []), ...D.cases.flatMap((c) => c.photos), ...D.emails.flatMap((e) => e.media)])];
  const sortKey = (p) => (caption[p] || '').split(' ')[0].split('/').reverse().join('');
  const vids = allMedia.filter(isVideo).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const pics = allMedia.filter((p) => !isVideo(p)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  $('#videos').innerHTML = vids.map((v) => `<figure><video src="${esc(v)}" controls preload="metadata" playsinline></video><figcaption>${esc(caption[v] || '')}</figcaption></figure>`).join('');
  $('#photos').innerHTML = pics.map((p) => `<figure><button data-media="${esc(p)}"><img src="${esc(p)}" loading="lazy" alt="${esc(caption[p] || '')}"></button><figcaption>${esc((caption[p] || '').split(' — ')[0])}</figcaption></figure>`).join('');

  // ---------- lightbox
  const lb = $('#lightbox');
  const closeLb = () => { lb.hidden = true; $('.lb-body', lb).innerHTML = ''; };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-media]');
    if (b) {
      const p = b.dataset.media;
      $('.lb-body', lb).innerHTML = isVideo(p) ? `<video src="${esc(p)}" controls autoplay playsinline></video>` : `<img src="${esc(p)}" alt="">`;
      $('.lb-cap', lb).textContent = caption[p] || '';
      lb.hidden = false;
    } else if (e.target === lb || e.target.classList.contains('lb-close')) closeLb();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });

  // Open a linked email when navigated to.
  function openTarget() {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!el) return;
    if (el.tagName === 'DETAILS') el.open = true;
    if (el.classList.contains('other')) { $('#show-other-cases').checked = true; renderCases(); }
  }
  window.addEventListener('hashchange', openTarget);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#mail-"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!document.getElementById(id)) { $('#show-acks').checked = true; renderMail(); }
    const el = document.getElementById(id); if (el) el.open = true;
  });
  openTarget();
})();
