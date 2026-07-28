const books = JSON.parse(await readFile('books.json'));
const man = JSON.parse(await readFile('raw/hd-covers.json'));
const norm = s => s.replace(/\(.*?\)/g,' ').replace(/\bany book in the\b|\bseries\b/gi,' ').replace(/[^a-z0-9 ]/gi,' ').replace(/\s+/g,' ').trim();
const t0 = Date.now();

// phase 1: resolve cover ids for anything still failing
const need = books.filter(b => { const m = man[b.id]; return m && (m.st === 'err' || (m.st||'').startsWith('http')); });
for (let i = 0; i < need.length; i += 4) {
  if (Date.now() - t0 > 4000) break;
  await Promise.all(need.slice(i, i + 4).map(async b => {
    const u = 'https://openlibrary.org/search.json?title=' + encodeURIComponent(norm(b.t)) +
      '&author=' + encodeURIComponent(norm(b.a || '')) + '&fields=cover_i&limit=5&sort=editions';
    try {
      const r = await fetch(u);
      if (!r.ok) return;
      const d = ((await r.json()).docs || []).find(x => x.cover_i);
      man[b.id] = d ? { st: 'pending', cid: d.cover_i } : { st: 'nomatch' };
    } catch (e) {}
  }));
}

// phase 2: download pending covers slowly (cover API is rate limited)
let saved = 0, fails = 0;
const pend = books.filter(b => man[b.id] && man[b.id].st === 'pending');
for (const b of pend) {
  if (Date.now() - t0 > 14000) break;
  const m = man[b.id];
  try {
    const cr = await fetch('https://covers.openlibrary.org/b/id/' + m.cid + '-L.jpg');
    if (!cr.ok) { fails++; continue; }
    const blob = await cr.blob();
    if (blob.size < 6000) { man[b.id] = { st: 'tiny' }; continue; }
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
    const ar = img.naturalHeight / img.naturalWidth;
    if (img.naturalWidth < 280) { man[b.id] = { st: 'lowres', w: img.naturalWidth }; continue; }
    if (ar < 1.25 || ar > 1.85) { man[b.id] = { st: 'badar' }; continue; }
    const slug = (b.cover || '').replace(/^covers\//, '').replace(/\.png$/, '') || ('id' + b.id);
    await saveFile('covers-hd/' + slug + '.jpg', blob);
    man[b.id] = { st: 'ok', path: 'covers-hd/' + slug + '.jpg', w: img.naturalWidth, h: img.naturalHeight };
    saved++;
  } catch (e) { fails++; }
  await new Promise(r => setTimeout(r, 700));
}
await saveFile('raw/hd-covers.json', JSON.stringify(man));
const tally = {}; Object.values(man).forEach(v => tally[v.st] = (tally[v.st]||0)+1);
log('saved', saved, 'fails', fails, JSON.stringify(tally));
