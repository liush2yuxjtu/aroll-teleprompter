import { handleUpload } from '@vercel/blob/client';
// 签发浏览器直传 Blob 的 client token；需 ?k=TP_KEY
export async function POST(request) {
  const k = new URL(request.url).searchParams.get('k');
  if (!process.env.TP_KEY || k !== process.env.TP_KEY) return Response.json({ error: 'bad key' }, { status: 401 });
  const body = await request.json();
  try {
    const r = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^recordings\/[\w.\-]+\/[\w.\-\/\u4e00-\u9fff ]+$/.test(pathname)) throw new Error('bad pathname');
        return { addRandomSuffix: true, maximumSizeInBytes: 5 * 1024 ** 3,
          allowedContentTypes: ['video/*', 'audio/*', 'application/json', 'application/octet-stream'] };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(r);
  } catch (e) { return Response.json({ error: String(e.message || e) }, { status: 400 }); }
}
