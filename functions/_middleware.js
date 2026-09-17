// 舊網址 antia-points.tonpair.com 一律 301 轉到新網址 xifun.tonpair.com（2026-09-17 改名）
// 保留路徑與查詢字串，老闆手機裡存的舊書籤還能用
const OLD_HOST = 'antia-points.tonpair.com';
const NEW_ORIGIN = 'https://xifun.tonpair.com';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === OLD_HOST) {
    return Response.redirect(NEW_ORIGIN + url.pathname + url.search + url.hash, 301);
  }
  return context.next();
}
