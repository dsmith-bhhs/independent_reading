const books = JSON.parse(await readFile('books.json'));
const man = JSON.parse(await readFile('raw/hd-covers.json'));
const norm = s => s.replace(/\(.*?\)/g,' ').replace(/\bany book in the\b|\bseries\b/gi,' ').replace(/[^a-z0-9 ]/gi,' ').replace(/\s+/g,' ').trim();
const t0 = Date.now();
const stale = ['nomatch','lowres','tiny','badar','badar-reverted','gbnone','gberr'];
const todo = books.filter(b => { const m = man[b.id]; return m && stale.includes(m.st); });
let saved = 0, tried = 0;
for (const b of todo) {
  if (Date.now() - t0 > 20000) break;
  tried++;
  try {
    const q = 'intitle:' + norm(b.t).split(' ').join('+') + (b.a ? '+inauthor:' + norm(b.a).split(' ').join('+') : '');
    const r = await fetch('https://www.googleapis.com/books/v1/volumes?q=' + q + '&maxResults=5&printType=books');
    if (!r.ok) { man[b.id] = { st: 'gberr', code: r.status }; continue; }
    const items = (await r.json()).items || [];
    let done = false;
    for (const it of items) {
      const li = it.volumeInfo && it.volumeInfo.imageLinks;
      if (!li) continue;
      const src = (li.thumbnail || li.smallThumbnail || '').replace(/&zoom=\d/, '&zoom=0').replace(/^http:/, 'https:');
      if (!src) continue;
      const cr = await fetch(src);
      if (!cr.ok) continue;
      const blob = await cr.blob();
      if (blob.size < 6000) continue;
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
      const ar = img.naturalHeight / img.naturalWidth;
      if (img.naturalWidth < 280 || ar < 1.3 || ar > 1.75) continue;
      const slug = b.cover.replace(/^covers(-hd)?\//, '').replace(/\.(png|jpg)$/, '');
      await saveFile('covers-hd/' + slug + '.jpg', blob);
      man[b.id] = { st: 'ok', src: 'gb', path: 'covers-hd/' + slug + '.jpg', w: img.naturalWidth, h: img.naturalHeight };
      saved++; done = true; break;
    }
    if (!done) man[b.id] = { st: 'gbnone' };
  } catch (e) { man[b.id] = { st: 'gberr', e: String(e).slice(0, 40) }; }
}
await saveFile('raw/hd-covers.json', JSON.stringify(man));
const tally = {}; Object.values(man).forEach(v => tally[v.st] = (tally[v.st]||0)+1);
log('tried', tried, 'saved', saved, '| remaining stale', todo.length - tried, JSON.stringify(tally));
