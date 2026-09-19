/**
 * /api/visit：官網累計瀏覽人次計數器（Cloudflare Pages Function + D1）
 *
 * 畫面顯示的數字 = BASE + 資料庫裡真實累計的 total。
 * BASE = 12600 是 Steve（2026-09-19）指定的起算數，之後每個真實訪客才會往上加。
 *
 * 怎麼算「真實」：
 *  - 只有 POST 才會加；GET 只讀取數字，重新整理不會灌水
 *  - 同一個「IP + 瀏覽器 + 當天日期」只算一次（存的是加鹽雜湊，不存 IP 原文，隔天自動清掉）
 *  - 機器人、爬蟲、curl、預覽器（User-Agent 判斷）、非同網域來源都不算
 * 所以單位是「人次」：同一個人隔天再來會再算一次。
 *
 * 資料表見 migrations/2026-09-19-site-visits.sql
 */

const BASE = 12600;
const SALT = 'xifun-visit-v1';
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|uptime|curl|wget|python|httpclient|node-fetch|axios|go-http|java\//i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  try {
    if (method === 'POST') {
      const ua = request.headers.get('User-Agent') || '';
      const site = request.headers.get('Sec-Fetch-Site');
      const counted = ua && !BOT.test(ua) && (!site || site === 'same-origin');
      if (counted) {
        const ip = request.headers.get('CF-Connecting-IP') || '';
        const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // 台灣日期
        const h = await sha256Hex(`${SALT}|${ip}|${ua}|${day}`);
        const ins = await env.DB.prepare('INSERT OR IGNORE INTO visit_seen (h, d) VALUES (?, ?)').bind(h, day).run();
        if (ins.meta && ins.meta.changes > 0) {
          await env.DB.prepare('UPDATE site_visits SET total = total + 1 WHERE id = 1').run();
        }
        if (Math.random() < 0.02) {
          await env.DB.prepare('DELETE FROM visit_seen WHERE d < ?').bind(day).run();
        }
      }
    }
    const row = await env.DB.prepare('SELECT total FROM site_visits WHERE id = 1').first();
    return json({ total: BASE + ((row && row.total) || 0) });
  } catch (e) {
    return json({ error: 'server_error' }, 500);   // 不回傳堆疊
  }
}
