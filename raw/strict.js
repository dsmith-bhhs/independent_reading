const books = JSON.parse(await readFile('books.json'));
const man = JSON.parse(await readFile('raw/hd-covers.json'));
const norm = s => (s||'').toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g,"'").replace(/\(.*?\)/g,' ')
  .replace(/\b(any book in the|series|trilogy|volume|the|a|an|and|or)\b/g,' ')
  .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const t0 = Date.now();
const stale = ['wrongmatch','exhausted','exhausted2','olerr','gberr','gbnone'];
const todo = books.filter(b => { const m = man[b.id]; return m && stale.includes(m.st); });
let saved = 0, tried = 0;

async function one(b) {
  const bt = norm(b.t), ba = norm(b.a || '');
  try {
    const u = 'https://openlibrary.org/search.json?title=' + encodeURIComponent(bt) +
      (ba ? '&author=' + encodeURIComponent(ba) : '') +
      '&fields=title,author_name,cover_i,language,edition_count&limit=20&sort=editions';
    const r = await fetch(u);
    if (!r.ok) { man[b.id] = { st: 'olerr', code: r.status }; return; }
    const docs = ((await r.json()).docs || []).filter(d => {
      if (!d.cover_i) return false;
      const dt = norm(d.title);
      if (dt !== bt && !dt.startsWith(bt) && !bt.startsWith(dt)) return false;
      if (d.language && d.language.length && !d.language.includes('eng')) return false;
      if (ba && d.author_name && !d.author_name.some(a => norm(a).split(' ').some(w => w.length > 3 && ba.includes(w)))) return false;
      return true;
    }).slice(0, 3);
    for (const d of docs) {
      try {
        const cr = await fetch('https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg');
        if (!cr.ok) continue;
        const blob = await cr.blob();
        if (blob.size < 9000) continue;
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
        const ar = img.naturalHeight / img.naturalWidth;
        if (img.naturalWidth < 280 || ar < 1.3 || ar > 1.75) continue;
        const slug = b.cover.replace(/^covers(-hd)?\//, '').replace(/\.(png|jpg)$/, '');
        await saveFile('covers-hd/' + slug + '-s.jpg', blob);
        man[b.id] = { st: 'ok', src: 'strict', path: 'covers-hd/' + slug + '-s.jpg', w: img.naturalWidth, h: img.naturalHeight, m: d.title };
        saved++;
        return;
      } catch (e) {}
    }
    man[b.id] = { st: 'nostrict' };
  } catch (e) { man[b.id] = { st: 'olerr', e: String(e).slice(0, 40) }; }
}

for (let i = 0; i < todo.length; i += 5) {
  if (Date.now() - t0 > 11000) break;
  const chunk = todo.slice(i, i + 5);
  await Promise.all(chunk.map(one));
  tried += chunk.length;
}
await saveFile('raw/hd-covers.json', JSON.stringify(man));
const tally = {}; Object.values(man).forEach(v => tally[v.st] = (tally[v.st]||0)+1);
log('tried', tried, 'saved', saved, '| left', todo.length - tried, JSON.stringify(tally));
