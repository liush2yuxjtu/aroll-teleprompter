import { put, list, del } from '@vercel/blob';
// 声音版本选择：POST/GET/DELETE /api/choice?k=TP_KEY
const ok = (req) => process.env.TP_KEY && new URL(req.url).searchParams.get('k') === process.env.TP_KEY;
const VALID = ['A', 'B', 'C', 'D'];
async function all() {
  const out = []; let cursor;
  do { const r = await list({ prefix: 'choices/', cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}
// POST {choice:"A"|"B"|"C"|"D", note?, test?} —— 记录一次选择
export async function POST(request) {
  if (!ok(request)) return Response.json({ error: 'bad key' }, { status: 401 });
  let b; try { b = await request.json(); } catch { return Response.json({ error: 'json' }, { status: 400 }); }
  if (!VALID.includes(b.choice)) return Response.json({ error: 'choice must be A/B/C/D' }, { status: 400 });
  const rec = { choice: b.choice, note: String(b.note || '').slice(0, 500), test: !!b.test, at: new Date().toISOString(), ua: request.headers.get('user-agent') || '' };
  const r = await put(`choices/${Date.now()}-${b.choice}.json`, JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: true });
  return Response.json({ saved: rec, pathname: r.pathname });
}
// GET —— 所有选择（最新在前）；latest = 最新一条非测试选择
export async function GET(request) {
  if (!ok(request)) return Response.json({ error: 'bad key' }, { status: 401 });
  const blobs = (await all()).sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
  const items = await Promise.all(blobs.slice(0, 50).map(async (x) => ({ pathname: x.pathname, ...(await (await fetch(x.url, { cache: 'no-store' })).json()) })));
  return Response.json({ latest: items.find((i) => !i.test) || null, choices: items }, { headers: { 'Cache-Control': 'no-store' } });
}
// DELETE ?pathname=... 或 ?test=1（删除所有测试选择）
export async function DELETE(request) {
  if (!ok(request)) return Response.json({ error: 'bad key' }, { status: 401 });
  const u = new URL(request.url); const p = u.searchParams.get('pathname'); const t = u.searchParams.get('test');
  let urls = [];
  if (p) urls = (await all()).filter((b) => b.pathname === p).map((b) => b.url);
  else if (t) { for (const b of await all()) { const j = await (await fetch(b.url, { cache: 'no-store' })).json(); if (j.test) urls.push(b.url); } }
  else return Response.json({ error: 'pathname or test=1 required' }, { status: 400 });
  if (urls.length) await del(urls);
  return Response.json({ deleted: urls.length });
}
