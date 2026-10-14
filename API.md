# A-roll 提词录制器（云端版）

- 页面：https://aroll-teleprompter.vercel.app/?k=<TP_KEY>（打开一次后，密钥会存进浏览器的 localStorage）
- Vercel 项目：aroll-teleprompter（team nyn5255-8475s-projects）
- Blob 存储：aroll-recordings（store_S5maH0ebmZ9TkopT，hkg1，public）
- 环境变量：TP_KEY（共享密钥），BLOB_READ_WRITE_TOKEN（自动注入）

## 存储结构
`recordings/<session>/chunks/000000.<ext>`：录制中每 5s 上传一个分片。按顺序拼接所有分片，就得到完整视频，可作为兜底。
`recordings/<session>/video.<ext>`：停止后自动上传的完整视频（大文件走 multipart）。
`recordings/<session>/markers.json`
`recordings/<时间戳>-manual/<文件名>`：「上传已下载的视频」上传的文件。
所有 blob 文件名都带随机后缀，URL 无法猜到。

## API
- `GET /api/recordings?k=KEY[&session=ID]`：返回 `{recordings:[{session,created,updated,status:"complete"|"in-progress"|"manual",files:[{name,bytes,uploadedAt,url,downloadUrl}],chunks:[…],chunk_count,chunk_bytes}]}`，最新的排在前面。下载时用 `downloadUrl`（或 `url`）直接 GET，不需要密钥。
- `DELETE /api/recordings?k=KEY&session=ID`：删除整个会话。
- `POST /api/upload?k=KEY`：@vercel/blob 客户端上传时用来换取 token 的接口（页面内部使用）。

示例：
    curl -s "https://aroll-teleprompter.vercel.app/api/recordings?k=$KEY" | jq '.recordings[0].files'
