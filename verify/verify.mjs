// 端到端验证：node verify/verify.mjs  （需要 TP_KEY 环境变量；BASE 默认生产地址）
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'https://aroll-teleprompter.vercel.app';
const KEY = process.env.TP_KEY; if (!KEY) { console.error('TP_KEY missing'); process.exit(2); }
const REC_MS = +process.env.REC_MS || 7000;
const plain = t => t.replace(/\*\*/g, '').replace(/\s*\/\s*/g, '');
const idx = await (await fetch(`${BASE}/scripts/index.json`)).json();
const ids = idx.scripts.map(s => s.id);
const views = { mobile: devices['Pixel 7'], desktop: { viewport: { width: 1440, height: 900 } } };
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const created = [];
try {
  for (const [vname, dev] of Object.entries(views)) {
    const ctx = await browser.newContext({ ...dev, permissions: ['camera', 'microphone'] });
    for (const id of ids) {
      const sc = await (await fetch(`${BASE}/scripts/${id}.json`)).json();
      const page = await ctx.newPage();
      await page.goto(`${BASE}/?k=${KEY}&script=${id}`);
      await page.waitForSelector(`#tab-${id}.on`);
      ok(await page.locator('#sbar .tab').count() === ids.length, `[${vname}/${id}] ${ids.length} 个脚本标签可见`);
      ok((await page.textContent('#intro')).includes(sc.instructions.slice(0, 10)), `[${vname}/${id}] 顶部说明显示`);
      // 字幕逐句
      let allOk = true;
      for (let n = 0; n < sc.sentences.length; n++) {
        const cur = (await page.textContent('#cur')).replace(/\s+/g, '');
        if (cur !== plain(sc.sentences[n].text).replace(/\s+/g, '') || (await page.textContent('#idx')).trim() !== `${n + 1} / ${sc.sentences.length}`) { allOk = false; console.log('  mismatch', n, cur); }
        await page.click('#next');
      }
      ok(allOk, `[${vname}/${id}] 字幕逐句渲染 ${sc.sentences.length} 句`);
      // 标签切换
      const other = ids.find(x => x !== id);
      await page.click(`#tab-${other}`); await page.waitForSelector(`#tab-${other}.on`);
      ok(new URL(page.url()).searchParams.get('script') === other && (await page.textContent('#idx')).trim().startsWith('1 /'), `[${vname}/${id}] 标签切换到 ${other}`);
      await page.click(`#tab-${id}`); await page.waitForSelector(`#tab-${id}.on`);
      // 录制上传
      await page.click('#rec'); await page.waitForFunction('typeof rec !== "undefined" && rec && rec.state === "recording"', null, { timeout: 15000 });
      await page.waitForTimeout(REC_MS / 2); await page.click('#next'); await page.waitForTimeout(REC_MS / 2);
      const sess = await page.evaluate('sess'); created.push(sess);
      await page.click('#rec');
      await page.waitForFunction(() => document.getElementById('m1').textContent.includes('已自动上传'), null, { timeout: 90000 });
      const r = await (await fetch(`${BASE}/api/recordings?k=${KEY}&session=${sess}`, { cache: 'no-store' })).json();
      const rec = r.recordings[0];
      const mk = rec && rec.files.find(f => f.name === 'markers.json');
      const mj = mk ? await (await fetch(mk.url)).json() : {};
      ok(rec && rec.status === 'complete' && rec.script === id && rec.chunk_count >= 1 && mj.script?.id === id && mj.markers.every(m => m.script === id),
        `[${vname}/${id}] 录音上传 ${sess} status=${rec?.status} script=${rec?.script} chunks=${rec?.chunk_count} markers.script=${mj.script?.id}`);
      await page.close();
    }
    await ctx.close();
  }
} catch (e) { ok(false, 'exception ' + e.message); }
finally {
  for (const s of created) { const d = await (await fetch(`${BASE}/api/recordings?k=${KEY}&session=${s}`, { method: 'DELETE' })).json(); console.log('cleanup', s, d); }
  await browser.close();
}
console.log(fail ? `RESULT: FAIL (${fail})` : 'RESULT: ALL PASS'); process.exit(fail ? 1 : 0);
