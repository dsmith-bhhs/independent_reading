const books = JSON.parse(await readFile('books.json'));
const man = JSON.parse(await readFile('raw/hd-covers.json'));
const norm = s => s.replace(/\(.*?\)/g,' ').replace(/\bany book in the\b|\bseries\b|\byoung readers edition\b|\btrilogy\b/gi,' ').replace(/[^a-z0-9 ]/gi,' ').replace(/\s+/g,' ').trim();
const t0 = Date.now();
const stale = ['exhausted','olerr'];
const todo = books.filter(b => { const m = man[b.id]; return m && stale.includes(m.st); });
let saved = 0, tried = 0;

async function one(b) {
  try {
    const q = norm(b.t).replace(/\b(and|or|volume|book|books)\b/gi,' ').replace(/\s+/g,' ').trim();
    const r = await fetch('https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&fields=cover_i&limit=10');
    if (!r.ok) { man[b.id] = { st: 'olerr', code: r.status }; return; }
    const docs = ((await r.json()).docs || []).filter(d => d.cover_i).slice(0, 2);
    for (const d of docs) {
      try {
        const cr = await fetch('https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg');
        if (!cr.ok) continue;
        const blob = await cr.blob();
        if (blob.size < 6000) continue;
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
        const ar = img.naturalHeight / img.naturalWidth;
        if (img.naturalWidth < 280 || ar < 1.3 || ar > 1.75) continue;
        const slug = b.cover.replace(/^covers(-hd)?\//, '').replace(/\.(png|jpg)$/, '');
        await saveFile('covers-hd/' + slug + '.jpg', blob);
        man[b.id] = { st: 'ok', src: 'ol2', path: 'covers-hd/' + slug + '.jpg', w: img.naturalWidth, h: img.naturalHeight };
        saved++;
        return;
      } catch (e) {}
    }
    man[b.id] = { st: 'exhausted2' };
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
