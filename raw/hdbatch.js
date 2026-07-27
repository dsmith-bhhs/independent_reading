const books = JSON.parse(await readFile('books.json'));
const man = JSON.parse(await readFile('raw/hd-covers.json'));
const norm = s => s.replace(/\(.*?\)/g,' ').replace(/\bany book in the\b|\bseries\b/gi,' ').replace(/[^a-z0-9 ]/gi,' ').replace(/\s+/g,' ').trim();
const fresh = books.filter(b => !man[b.id]);
const retry = books.filter(b => man[b.id] && (man[b.id].st === 'err' || (man[b.id].st||'').startsWith('http')));
const todo = fresh.concat(retry);
const t0 = Date.now(); let saved = 0;
async function one(b, attempt) {
  const title = norm(b.t), author = norm(b.a || '');
  const u = 'https://openlibrary.org/search.json?title=' + encodeURIComponent(title) +
    (author ? '&author=' + encodeURIComponent(author) : '') + '&fields=title,cover_i&limit=5&sort=editions';
  try {
    const r = await fetch(u);
    if (!r.ok) return { st: 'http' + r.status };
    const d = ((await r.json()).docs || []).find(x => x.cover_i);
    if (!d) return { st: 'nomatch' };
    const cr = await fetch('https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg');
    if (!cr.ok) return { st: 'imghttp' + cr.status };
    const blob = await cr.blob();
    if (blob.size < 6000) return { st: 'tiny' };
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
    const ar = img.naturalHeight / img.naturalWidth;
    if (img.naturalWidth < 280) return { st: 'lowres', w: img.naturalWidth };
    if (ar < 1.25 || ar > 1.85) return { st: 'badar', w: img.naturalWidth, h: img.naturalHeight };
    const slug = (b.cover || '').replace(/^covers\//, '').replace(/\.png$/, '') || ('id' + b.id);
    await saveFile('covers-hd/' + slug + '.jpg', blob);
    saved++;
    return { st: 'ok', path: 'covers-hd/' + slug + '.jpg', w: img.naturalWidth, h: img.naturalHeight };
  } catch (e) {
    if (!attempt) { await new Promise(r => setTimeout(r, 500)); return one(b, 1); }
    return { st: 'err', e: String(e).slice(0, 40) };
  }
}
let done = 0;
for (let i = 0; i < todo.length; i += 5) {
  const chunk = todo.slice(i, i + 5);
  const res = await Promise.all(chunk.map(b => one(b, 0)));
  chunk.forEach((b, j) => { man[b.id] = res[j]; done++; });
  if (Date.now() - t0 > 19000) break;
}
await saveFile('raw/hd-covers.json', JSON.stringify(man));
const tally = {}; Object.values(man).forEach(v => tally[v.st] = (tally[v.st]||0)+1);
log('batch', done, 'saved', saved, '| manifest', Object.keys(man).length, '/', books.length, JSON.stringify(tally));
