import { list, del } from '@vercel/blob';
const ok = (req) => process.env.TP_KEY && new URL(req.url).searchParams.get('k') === process.env.TP_KEY;
async function all() {
  const out = []; let cursor;
  do { const r = await list({ prefix: 'recordings/', cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}
// GET /api/recordings?k=KEY[&session=ID] —— 按会话分组，最新在前
export async function GET(request) {
  if (!ok(request)) return Response.json({ error: 'bad key' }, { status: 401 });
  const only = new URL(request.url).searchParams.get('session');
  const g = {};
  for (const b of await all()) {
    const [, sid, ...rest] = b.pathname.split('/');
    if (only && sid !== only) continue;
    const s = (g[sid] ||= { session: sid, created: b.uploadedAt, updated: b.uploadedAt, files: [], chunks: [] });
    const f = { name: rest.join('/').replace(/-[A-Za-z0-9]{30}(?=\.[^.]+$)/, ''), pathname: b.pathname, bytes: b.size, uploadedAt: b.uploadedAt, url: b.url, downloadUrl: b.downloadUrl };
    (rest[0] === 'chunks' ? s.chunks : s.files).push(f);
    if (b.uploadedAt < s.created) s.created = b.uploadedAt;
    if (b.uploadedAt > s.updated) s.updated = b.uploadedAt;
  }
  const recs = Object.values(g).map(s => {
    s.chunks.sort((a, b) => a.name.localeCompare(b.name));
    s.status = s.files.some(f => f.name.startsWith('video.')) && s.files.some(f => f.name === 'markers.json') ? 'complete' : (s.session.endsWith('-manual') ? 'manual' : 'in-progress');
    const m = /^\d{14}-(.+)-[a-z0-9]{1,6}$/.exec(s.session); s.script = m ? m[1] : null;
    s.chunk_count = s.chunks.length; s.chunk_bytes = s.chunks.reduce((a, c) => a + c.bytes, 0);
    return s;
  }).sort((a, b) => (a.created < b.created ? 1 : -1));
  return Response.json({ recordings: recs }, { headers: { 'Cache-Control': 'no-store' } });
}
// DELETE /api/recordings?k=KEY&session=ID —— 删除整个会话
export async function DELETE(request) {
  if (!ok(request)) return Response.json({ error: 'bad key' }, { status: 401 });
  const sid = new URL(request.url).searchParams.get('session');
  if (!sid) return Response.json({ error: 'session required' }, { status: 400 });
  const urls = (await all()).filter(b => b.pathname.startsWith(`recordings/${sid}/`)).map(b => b.url);
  if (urls.length) await del(urls);
  return Response.json({ deleted: urls.length });
}
