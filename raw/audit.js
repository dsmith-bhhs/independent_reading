const list = JSON.parse(await readFile('raw/risky.json'));
const START = Number(globalThis.__auditStart || 0), N = 21;
const slice = list.slice(START, START + N);
const cols = 7, cw = 150, ch = 250;
const c = createCanvas(cols * cw, Math.ceil(slice.length / cols) * ch);
const ctx = c.getContext('2d');
ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
for (let i = 0; i < slice.length; i++) {
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  try {
    const img = await readImage(slice[i].c);
    const s = Math.min((cw - 12) / img.naturalWidth, (ch - 52) / img.naturalHeight);
    ctx.drawImage(img, x + 6, y + 6, img.naturalWidth * s, img.naturalHeight * s);
  } catch (e) { ctx.fillStyle = '#f00'; ctx.font = '11px sans-serif'; ctx.fillText('missing', x + 10, y + 40); }
  ctx.fillStyle = '#000'; ctx.font = '11px sans-serif'; ctx.fillText(slice[i].t.slice(0, 26), x + 6, y + ch - 32);
  ctx.fillStyle = '#666'; ctx.fillText((slice[i].a || '').slice(0, 26), x + 6, y + ch - 18);
}
await saveFile('raw/audit.png', c);
log('rows', START, '-', START + slice.length, 'of', list.length);
