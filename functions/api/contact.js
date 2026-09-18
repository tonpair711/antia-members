/**
 * /api/contact：喜翻官網詢問表單的收件端（Cloudflare Pages Function）
 *
 * 做法比照 D:\ClaudeOnly\company\hunglun2026\functions\api\contact.js：
 * 1. 同網域打，沒有 CORS 問題（Apps Script /exec 會 302，瀏覽器直接打會被 CORS 擋）
 * 2. Turnstile secret 與 Apps Script 網址只存在伺服器端環境變數，不進前端
 * 3. 蜜罐、必填、長度、Turnstile 驗證在轉信之前就擋掉
 *
 * 需要的環境變數（Cloudflare Pages 專案 → 設定 → 環境變數設定，Production 與 Preview 都要）：
 *   APPS_SCRIPT_URL      Apps Script 網頁應用程式網址（結尾 /exec，部署在 tonpair711@gmail.com）
 *   FORM_SHARED_SECRET   與 Apps Script 裡的 SHARED_SECRET 一模一樣
 *   TURNSTILE_SECRET     Cloudflare Turnstile 的 secret key（xifun.tonpair.com 專用的一組，不能沿用 hunglun2026 的）
 * 少任何一個，這支會回 503。
 *
 * 對應的 Apps Script 原始碼在 D:\ClaudeOnly\company\xihuan-contact-form\Code.gs（不進公開 repo）。
 */

const MAX = { name: 100, email: 200, phone: 60, topic: 100, message: 5000 };

function sliceSafe(str, max) {
  const s = str.slice(0, max);
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const missing = ['APPS_SCRIPT_URL', 'FORM_SHARED_SECRET', 'TURNSTILE_SECRET'].filter((k) => !env[k]);
  if (missing.length) {
    console.error('缺少環境變數：' + missing.join('、'));
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  // 蜜罐：真人看不到這個欄位，會填的幾乎都是機器人。回 ok 讓對方以為送出了
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true });
  }

  const f = {};
  for (const k of Object.keys(MAX)) {
    f[k] = typeof body[k] === 'string' ? sliceSafe(body[k].trim(), MAX[k]) : '';
  }

  if (!f.name || !f.email || !f.message) {
    return json({ ok: false, error: 'missing_required' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) {
    return json({ ok: false, error: 'bad_email' }, 400);
  }
  if (f.message.length < 5) {
    return json({ ok: false, error: 'message_too_short' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return json({ ok: false, error: 'no_token' }, 400);

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  let verify;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    verify = await r.json();
  } catch (err) {
    console.error('turnstile_unreachable: ' + err);
    return json({ ok: false, error: 'verify_failed' }, 502);
  }
  if (!verify || typeof verify !== 'object' || !verify.success) {
    console.warn('turnstile_rejected: ' + JSON.stringify(verify['error-codes'] || []));
    return json({ ok: false, error: 'verify_failed' }, 403);
  }

  try {
    const r = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.FORM_SHARED_SECRET,
        ...f,
        page: typeof body.page === 'string' ? body.page.slice(0, 300) : '',
      }),
    });
    const out = await r.json();
    if (!out || out.ok !== true) {
      console.error('apps_script_error: ' + JSON.stringify(out));
      return json({ ok: false, error: 'send_failed' }, 502);
    }
  } catch (err) {
    console.error('apps_script_unreachable: ' + err);
    return json({ ok: false, error: 'send_failed' }, 502);
  }

  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
