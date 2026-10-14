# A-roll 提词录制器（aroll-teleprompter）

手机/电脑浏览器里打开就能用的抖音口播提词 + 录制器，录完自动上传到 Vercel Blob（store `aroll-recordings`）。

生产地址：https://aroll-teleprompter.vercel.app/?k=<TP_KEY>&script=<脚本id>

## 脚本（全部逐句提词，不需要即兴发挥）
| id | 用途 |
|---|---|
| `koubo` | v1 口播正片：为什么你收藏了几百个 AI 教程，还是不会用 AI？（16 句） |
| `chat20` | v2 约 20 秒日常闲聊（语气：像跟朋友聊天） |
| `voice-sample` | v3 声音样本 |

脚本放在 `public/scripts/<id>.json`：`{id,title,purpose,instructions,sentences:[{text,plain,speed,tone}]}`，
`text` 里 `/` 表示停顿、`**词**` 表示重读；`plain` 为纯文本。新增脚本：加一个 json 并在 `public/scripts/index.json` 登记即可。
页面顶部有脚本标签可点击切换，`?script=<id>` 直接打开某个脚本。

## 录音元数据
- 会话 id：`<YYYYMMDDHHMMSS>-<脚本id>-<随机>`，blob 路径 `recordings/<会话>/…`
- `markers.json` 含 `script:{id,title,sentences}`，每个 marker 也带 `script`
- `GET /api/recordings?k=KEY` 每条记录有 `script` 字段（旧录音为 null）
- 其余行为不变：每 5s 分片上传、原始音频（关闭回声消除/降噪/自动增益）、麦克风电平与测试、手机/电脑两套布局。详见 API.md。

## 验证（Verify）
```bash
npm ci && npx playwright install chromium
TP_KEY=$(cat /workspace/teleprompter/.tp_key) node verify/verify.mjs      # BASE=... 可改目标地址
```
用 headless Chromium + `--use-fake-device-for-media-stream` 假摄像头/麦克风，在手机（Pixel 7）和桌面（1440×900）视口下对每个脚本：
检查标签数量与切换、顶部说明、逐句字幕与「n / 总数」、录制约 7s → 等待「已自动上传」→ `/api/recordings?session=` 返回 complete、`script` 正确、分片 ≥1、markers.json 的 script.id 正确，
最后只 DELETE 本次测试创建的会话（不会动真实录音）。

**手机文字显示检查**（先于录制检查运行；`TEXT_ONLY=1` 只跑这部分，不上传）：iPhone SE 375×667、iPhone 14 390×844、Pixel 7 412×915、小屏安卓 360×740，竖屏+横屏，空闲+录制中布局，每个脚本逐句检查：
无横向溢出（scrollWidth≤clientWidth）、字幕 `#cur` 完整在视口内、字幕文字区域 elementFromPoint 不被按钮遮挡、字号 16–72px、字幕不被裁切（scrollHeight≤clientHeight）、中文不是豆腐块（canvas measureText 对比缺字宽度）。截图保存在 `verify/artifacts/`（可用 `ART=` 改目录）。输出 `RESULT: ALL PASS` 为通过。

## 部署
Vercel 项目 `aroll-teleprompter`（team nyn5255-8475s-projects），环境变量 `TP_KEY`、`BLOB_READ_WRITE_TOKEN`。
