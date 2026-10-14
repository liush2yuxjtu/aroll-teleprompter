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
const ART = process.env.ART || 'verify/artifacts'; (await import('fs')).mkdirSync(ART, { recursive: true });
const phones = { 'iphone-se': [375, 667], 'iphone-14': [390, 844], 'pixel-7': [412, 915], 'android-small': [360, 740] };
// 手机文字显示检查：返回问题列表
const textIssues = () => {
  const out = [], de = document.documentElement, W = innerWidth, H = innerHeight, cur = document.getElementById('cur');
  if (de.scrollWidth > de.clientWidth + 1 || document.body.scrollWidth > W + 1) out.push(`横向溢出 scrollWidth=${de.scrollWidth}>${de.clientWidth}`);
  const r = cur.getBoundingClientRect();
  if (r.top < 0 || r.left < 0 || r.bottom > H + 1 || r.right > W + 1 || r.height < 10) out.push(`字幕超出视口 ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
  const fs = parseFloat(getComputedStyle(cur).fontSize); if (fs < 16 || fs > 72) out.push(`字号不合适 ${fs}px`);
  if (cur.scrollHeight > cur.clientHeight + 2 || cur.scrollWidth > cur.clientWidth + 2) out.push(`字幕被裁切 scroll=${cur.scrollWidth}x${cur.scrollHeight} client=${cur.clientWidth}x${cur.clientHeight}`);
  const rg = document.createRange(); rg.selectNodeContents(cur); let bad = 0, n = 0;
  for (const rr of rg.getClientRects()) for (const fx of [.1, .5, .9]) { const x = rr.left + rr.width * fx, y = rr.top + rr.height / 2; n++;
    const el = document.elementFromPoint(x, y); if (!el || !cur.contains(el)) { bad++; if (bad < 3) out.push(`字幕被遮挡 @${Math.round(x)},${Math.round(y)} by ${el ? el.tagName + '#' + el.id : 'null'}`); } }
  const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(cur).font; const tofu = c.measureText('\u{10FFFD}').width;
  const cjk = [...cur.textContent].filter(ch => /[\u4e00-\u9fff]/.test(ch)); const t = cjk.filter(ch => Math.abs(c.measureText(ch).width - tofu) < .01 && document.fonts && !document.fonts.check('16px ' + getComputedStyle(cur).fontFamily, ch));
  if (cjk.length && t.length) out.push(`疑似豆腐块 ${t.slice(0, 5).join('')}`);
  return out;
};
try {
  for (const [pn, [pw, ph]] of Object.entries(phones)) for (const orient of ['portrait', 'landscape']) {
    const [W, H] = orient === 'portrait' ? [pw, ph] : [ph, pw];
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ['camera', 'microphone'] });
    for (const id of ids) {
      const page = await ctx.newPage(); await page.goto(`${BASE}/?k=${KEY}&script=${id}`); await page.waitForSelector(`#tab-${id}.on`);
      const sc = await (await fetch(`${BASE}/scripts/${id}.json`)).json();
      for (const mode of ['idle', 'recording']) {
        if (mode === 'recording') await page.evaluate(() => { document.body.classList.add('recing'); if (window.fitCur) fitCur(); }); // 模拟录制中布局（不上传）
        const issues = [];
        await page.evaluate(() => { try { i = 0; render(); } catch (e) {} });
        for (let n = 0; n < sc.sentences.length; n++) {
          await page.waitForTimeout(30);
          for (const x of await page.evaluate(textIssues)) issues.push(`句${n + 1}: ${x}`);
          if (n === 0 || n === 6) await page.screenshot({ path: `${ART}/${pn}-${orient}-${id}-${mode}-s${n + 1}.png` });
          await page.click('#next', { force: true });
        }
        ok(!issues.length, `[文字显示 ${pn} ${W}x${H} ${orient}/${id}/${mode}] ${issues.length ? issues.slice(0, 4).join(' | ') + (issues.length > 4 ? ` …共${issues.length}项` : '') : 'OK'}`);
      }
      await page.close();
    }
    await ctx.close();
  }
  if (process.env.TEXT_ONLY) throw new Error('TEXT_ONLY');

  for (const [vname, dev] of Object.entries(views)) {
    const ctx = await browser.newContext({ ...dev, permissions: ['camera', 'microphone'] });
    for (const id of ids) {
      const sc = await (await fetch(`${BASE}/scripts/${id}.json`)).json();
      const page = await ctx.newPage();
      await page.goto(`${BASE}/?k=${KEY}&script=${id}`);
      await page.waitForSelector(`#tab-${id}.on`);
      ok(await page.locator('#sbar .tab[data-id]').count() === ids.length, `[${vname}/${id}] ${ids.length} 个脚本标签可见`);
      ok((await page.textContent('#intro')).includes(sc.instructions.slice(0, 10)), `[${vname}/${id}] 顶部说明显示`);
      // 字幕逐句
      let allOk = true;
      for (let n = 0; n < sc.sentences.length; n++) {
        const cur = (await page.textContent('#cur')).replace(/[\s/]+/g, '');
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
} catch (e) { if (e.message !== 'TEXT_ONLY') ok(false, 'exception ' + e.message); }
finally {
  for (const s of created) { const d = await (await fetch(`${BASE}/api/recordings?k=${KEY}&session=${s}`, { method: 'DELETE' })).json(); console.log('cleanup', s, d); }
  await browser.close();
}
console.log(fail ? `RESULT: FAIL (${fail})` : 'RESULT: ALL PASS'); process.exit(fail ? 1 : 0);
