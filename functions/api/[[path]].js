// antia-members API — Cloudflare Pages Functions (catch-all router)
// 認證：HMAC-SHA256 簽章 token（id.exp.sig），密碼 PBKDF2-SHA256

const ROLE_LEVEL = { member: 0, staff: 1, boss: 2, admin: 3 };
const enc = new TextEncoder();

// ---------- 工具 ----------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function err(message, status = 400) {
  return json({ error: message }, status);
}
function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 100000 },
    key, 256
  );
  return hex(bits);
}

async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

async function makeToken(secret, userId) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400; // 7 天
  const body = `${userId}.${exp}`;
  return `${body}.${await hmacSign(secret, body)}`;
}

async function verifyToken(secret, token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (parseInt(exp) < Math.floor(Date.now() / 1000)) return null;
  const expect = await hmacSign(secret, `${id}.${exp}`);
  if (sig !== expect) return null;
  return parseInt(id);
}

// 從請求取得目前使用者（含最新 role / active 狀態）
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const userId = await verifyToken(env.AUTH_SECRET, auth.slice(7));
  if (!userId) return null;
  const user = await env.DB.prepare(
    'SELECT id, account, name, phone, email, role, active FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!user || !user.active) return null;
  return user;
}

function requireRole(user, minRole) {
  if (!user) return err('請先登入', 401);
  if (ROLE_LEVEL[user.role] < ROLE_LEVEL[minRole]) return err('權限不足', 403);
  return null;
}

async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of results) s[r.key] = r.value;
  return {
    rate_amount: parseInt(s.rate_amount) || 100,
    rate_points: parseInt(s.rate_points) || 10,
    validity_months: parseInt(s.validity_months) || 6,
    redeem_value: parseInt(s.redeem_value) || 1,
  };
}

// 有效餘額 = 未到期批次的 remaining 總和
async function getBalance(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(remaining),0) AS bal FROM transactions WHERE user_id = ? AND remaining > 0 AND expires_at > datetime('now')"
  ).bind(userId).first();
  return row.bal;
}

// 30 天內到期的點數
async function getExpiringSoon(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(remaining),0) AS pts, MIN(expires_at) AS earliest FROM transactions WHERE user_id = ? AND remaining > 0 AND expires_at > datetime('now') AND expires_at <= datetime('now','+30 days')"
  ).bind(userId).first();
  return { points: row.pts, earliest: row.earliest };
}

// FIFO 扣點：從最早到期的批次開始扣，回傳更新語句陣列；點數不足回傳 null
async function buildDeduction(env, userId, points) {
  const { results: batches } = await env.DB.prepare(
    "SELECT id, remaining FROM transactions WHERE user_id = ? AND remaining > 0 AND expires_at > datetime('now') ORDER BY expires_at ASC"
  ).bind(userId).all();
  let need = points;
  const stmts = [];
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(b.remaining, need);
    need -= take;
    stmts.push(env.DB.prepare('UPDATE transactions SET remaining = remaining - ? WHERE id = ?').bind(take, b.id));
  }
  return need > 0 ? null : stmts;
}

function validAccount(account) {
  return /^09\d{8}$/.test(account) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account);
}

// ---------- 主路由 ----------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  const method = request.method;

  try {
    // ---- 公開 ----
    if (path === '/register' && method === 'POST') {
      const b = await request.json();
      const account = (b.account || '').trim().toLowerCase();
      const name = (b.name || '').trim();
      const password = b.password || '';
      if (!validAccount(account)) return err('帳號須為手機號碼（09 開頭 10 碼）或 Email');
      if (!name) return err('請輸入姓名');
      if (password.length < 6) return err('密碼至少 6 個字元');
      const exists = await env.DB.prepare('SELECT id FROM users WHERE account = ?').bind(account).first();
      if (exists) return err('此帳號已註冊');
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await pbkdf2(password, salt);
      const phone = /^09\d{8}$/.test(account) ? account : '';
      const email = account.includes('@') ? account : '';
      await env.DB.prepare(
        'INSERT INTO users (account, password_hash, salt, name, phone, email) VALUES (?,?,?,?,?,?)'
      ).bind(account, hash, salt, name, phone, email).run();
      return json({ ok: true });
    }

    if (path === '/login' && method === 'POST') {
      const b = await request.json();
      const account = (b.account || '').trim().toLowerCase();
      const user = await env.DB.prepare('SELECT * FROM users WHERE account = ?').bind(account).first();
      if (!user || !user.active) return err('帳號或密碼錯誤', 401);
      const hash = await pbkdf2(b.password || '', user.salt);
      if (hash !== user.password_hash) return err('帳號或密碼錯誤', 401);
      const token = await makeToken(env.AUTH_SECRET, user.id);
      return json({ token, role: user.role, name: user.name });
    }

    // ---- 登入後 ----
    const user = await getUser(request, env);

    if (path === '/me' && method === 'GET') {
      const denied = requireRole(user, 'member');
      if (denied) return denied;
      const balance = await getBalance(env, user.id);
      const expiring = await getExpiringSoon(env, user.id);
      const { results: txs } = await env.DB.prepare(
        'SELECT id, type, amount, points, expires_at, note, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50'
      ).bind(user.id).all();
      return json({ user, balance, expiring, transactions: txs });
    }

    if (path === '/me/password' && method === 'POST') {
      const denied = requireRole(user, 'member');
      if (denied) return denied;
      const b = await request.json();
      if ((b.new_password || '').length < 6) return err('新密碼至少 6 個字元');
      const full = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(user.id).first();
      const oldHash = await pbkdf2(b.old_password || '', full.salt);
      if (oldHash !== full.password_hash) return err('舊密碼錯誤', 401);
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await pbkdf2(b.new_password, salt);
      await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, user.id).run();
      return json({ ok: true });
    }

    // ---- 店員以上 ----
    if (path === '/members' && method === 'GET') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const q = (url.searchParams.get('q') || '').trim();
      const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
      const per = 20;
      let where = "role = 'member'";
      let binds = [];
      if (q) {
        where += ' AND (account LIKE ? OR name LIKE ? OR phone LIKE ? OR email LIKE ?)';
        const like = `%${q}%`;
        binds = [like, like, like, like];
      }
      const { results } = await env.DB.prepare(
        `SELECT id, account, name, phone, email, active, created_at FROM users WHERE ${where} ORDER BY id DESC LIMIT ${per + 1} OFFSET ${(page - 1) * per}`
      ).bind(...binds).all();
      const hasMore = results.length > per;
      return json({ members: results.slice(0, per), hasMore, page });
    }

    // 店員/老闆手動建檔（免註冊，客戶不用自己有帳密）＋可選初始點數
    if (path === '/members' && method === 'POST') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const b = await request.json();
      const name = (b.name || '').trim();
      const phone = (b.phone || '').trim();
      const points = parseInt(b.points) || 0;
      if (!name) return err('請輸入姓名');
      const result = await env.DB.prepare(
        "INSERT INTO users (account, password_hash, salt, name, phone, email, role) VALUES (NULL, NULL, NULL, ?, ?, '', 'member')"
      ).bind(name, phone).run();
      const userId = result.meta.last_row_id;
      if (points > 0) {
        const s = await getSettings(env);
        await env.DB.prepare(
          `INSERT INTO transactions (user_id, type, points, remaining, expires_at, operator_id, note)
           VALUES (?,'adjust',?,?,datetime('now','+${s.validity_months} months'),?,?)`
        ).bind(userId, points, points, user.id, b.note || '新增客戶').run();
      }
      const balance = await getBalance(env, userId);
      return json({ ok: true, id: userId, balance });
    }

    const memberMatch = path.match(/^\/members\/(\d+)$/);
    if (memberMatch && method === 'GET') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const id = parseInt(memberMatch[1]);
      const m = await env.DB.prepare(
        'SELECT id, account, name, phone, email, active, created_at FROM users WHERE id = ?'
      ).bind(id).first();
      if (!m) return err('找不到會員', 404);
      const balance = await getBalance(env, id);
      const expiring = await getExpiringSoon(env, id);
      const { results: txs } = await env.DB.prepare(
        `SELECT t.id, t.type, t.amount, t.points, t.expires_at, t.note, t.created_at, o.name AS operator_name
         FROM transactions t LEFT JOIN users o ON o.id = t.operator_id
         WHERE t.user_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 30`
      ).bind(id).all();
      return json({ member: m, balance, expiring, transactions: txs });
    }

    // 設定/重設會員登入帳密（開通免登入客戶的登入，或重設忘記密碼的會員）
    if (memberMatch && method === 'PUT') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const id = parseInt(memberMatch[1]);
      const b = await request.json();
      const account = (b.account || '').trim().toLowerCase();
      if (!validAccount(account)) return err('帳號須為手機號碼（09 開頭 10 碼）或 Email');
      if ((b.password || '').length < 6) return err('密碼至少 6 個字元');
      const target = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'member'").bind(id).first();
      if (!target) return err('找不到會員', 404);
      const exists = await env.DB.prepare('SELECT id FROM users WHERE account = ? AND id != ?').bind(account, id).first();
      if (exists) return err('此帳號已被其他人使用');
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await pbkdf2(b.password, salt);
      await env.DB.prepare('UPDATE users SET account = ?, password_hash = ?, salt = ? WHERE id = ?')
        .bind(account, hash, salt, id).run();
      return json({ ok: true });
    }

    // 刪除客戶（要輸入操作者自己的密碼確認，不是客戶密碼）
    if (memberMatch && method === 'DELETE') {
      const denied = requireRole(user, 'boss');
      if (denied) return denied;
      const id = parseInt(memberMatch[1]);
      const b = await request.json();
      const full = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(user.id).first();
      const hash = await pbkdf2(b.password || '', full.salt);
      if (hash !== full.password_hash) return err('密碼錯誤', 401);
      const target = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'member'").bind(id).first();
      if (!target) return err('找不到會員', 404);
      await env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 用帳號找會員（掃 QR Code 後查詢）
    if (path === '/members/by-account' && method === 'GET') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const account = (url.searchParams.get('account') || '').trim().toLowerCase();
      const m = await env.DB.prepare(
        "SELECT id FROM users WHERE account = ? AND role = 'member'"
      ).bind(account).first();
      if (!m) return err('找不到會員', 404);
      return json({ id: m.id });
    }

    if (path === '/points/earn' && method === 'POST') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const b = await request.json();
      const amount = parseInt(b.amount);
      const userId = parseInt(b.user_id);
      if (!userId || !amount || amount <= 0) return err('金額不正確');
      const target = await env.DB.prepare('SELECT id, active FROM users WHERE id = ?').bind(userId).first();
      if (!target || !target.active) return err('找不到會員', 404);
      const s = await getSettings(env);
      const points = Math.floor(amount / s.rate_amount) * s.rate_points;
      if (points <= 0) return err(`消費未滿 ${s.rate_amount} 元，不足以累點`);
      await env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, points, remaining, expires_at, operator_id, note)
         VALUES (?,'earn',?,?,?,datetime('now','+${s.validity_months} months'),?,?)`
      ).bind(userId, amount, points, points, user.id, b.note || '').run();
      const balance = await getBalance(env, userId);
      return json({ ok: true, points, balance });
    }

    if (path === '/points/redeem' && method === 'POST') {
      const denied = requireRole(user, 'staff');
      if (denied) return denied;
      const b = await request.json();
      const points = parseInt(b.points);
      const userId = parseInt(b.user_id);
      if (!userId || !points || points <= 0) return err('點數不正確');
      const stmts = await buildDeduction(env, userId, points);
      if (!stmts) return err('點數餘額不足');
      stmts.push(env.DB.prepare(
        'INSERT INTO transactions (user_id, type, points, operator_id, note) VALUES (?,?,?,?,?)'
      ).bind(userId, 'redeem', -points, user.id, b.note || ''));
      await env.DB.batch(stmts);
      const balance = await getBalance(env, userId);
      return json({ ok: true, balance });
    }

    // ---- 老闆以上 ----
    if (path === '/points/adjust' && method === 'POST') {
      const denied = requireRole(user, 'boss');
      if (denied) return denied;
      const b = await request.json();
      const points = parseInt(b.points);
      const userId = parseInt(b.user_id);
      if (!userId || !points) return err('點數不正確');
      if (points > 0) {
        const s = await getSettings(env);
        await env.DB.prepare(
          `INSERT INTO transactions (user_id, type, points, remaining, expires_at, operator_id, note)
           VALUES (?,'adjust',?,?,datetime('now','+${s.validity_months} months'),?,?)`
        ).bind(userId, points, points, user.id, b.note || '手動補點').run();
      } else {
        const stmts = await buildDeduction(env, userId, -points);
        if (!stmts) return err('點數餘額不足');
        stmts.push(env.DB.prepare(
          'INSERT INTO transactions (user_id, type, points, operator_id, note) VALUES (?,?,?,?,?)'
        ).bind(userId, 'adjust', points, user.id, b.note || '手動扣點'));
        await env.DB.batch(stmts);
      }
      const balance = await getBalance(env, userId);
      return json({ ok: true, balance });
    }

    if (path === '/settings' && method === 'GET') {
      const denied = requireRole(user, 'staff'); // 店員需要讀規則以預覽點數
      if (denied) return denied;
      return json(await getSettings(env));
    }

    if (path === '/settings' && method === 'PUT') {
      const denied = requireRole(user, 'boss');
      if (denied) return denied;
      const b = await request.json();
      const stmts = [];
      for (const key of ['rate_amount', 'rate_points', 'validity_months', 'redeem_value']) {
        const v = parseInt(b[key]);
        if (!v || v <= 0) return err(`${key} 必須為正整數`);
        stmts.push(env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(String(v), key));
      }
      await env.DB.batch(stmts);
      return json({ ok: true });
    }

    if (path === '/reports' && method === 'GET') {
      const denied = requireRole(user, 'boss');
      if (denied) return denied;
      const period = url.searchParams.get('period') === 'monthly' ? 'monthly' : 'daily';
      // 以台灣時區 (+8) 分組
      const fmt = period === 'monthly' ? '%Y-%m' : '%Y-%m-%d';
      const range = period === 'monthly' ? "-12 months" : "-30 days";
      const { results } = await env.DB.prepare(
        `SELECT strftime('${fmt}', created_at, '+8 hours') AS period,
                SUM(CASE WHEN type='earn' THEN amount ELSE 0 END) AS total_amount,
                SUM(CASE WHEN points > 0 THEN points ELSE 0 END) AS points_issued,
                SUM(CASE WHEN points < 0 THEN -points ELSE 0 END) AS points_redeemed,
                COUNT(DISTINCT user_id) AS active_members,
                COUNT(*) AS tx_count
         FROM transactions
         WHERE created_at > datetime('now', '${range}')
         GROUP BY period ORDER BY period DESC`
      ).all();
      const totalMembers = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role='member' AND active=1").first();
      return json({ period, rows: results, total_members: totalMembers.c });
    }

    // ---- admin：店員/老闆帳號管理 ----
    if (path === '/staff' && method === 'GET') {
      const denied = requireRole(user, 'admin');
      if (denied) return denied;
      const { results } = await env.DB.prepare(
        "SELECT id, account, name, role, active, created_at FROM users WHERE role != 'member' ORDER BY id"
      ).all();
      return json({ staff: results });
    }

    if (path === '/staff' && method === 'POST') {
      const denied = requireRole(user, 'admin');
      if (denied) return denied;
      const b = await request.json();
      const account = (b.account || '').trim().toLowerCase();
      const name = (b.name || '').trim();
      if (!account || !name) return err('請輸入帳號與姓名');
      if ((b.password || '').length < 6) return err('密碼至少 6 個字元');
      if (!['staff', 'boss', 'admin'].includes(b.role)) return err('角色不合法');
      const exists = await env.DB.prepare('SELECT id FROM users WHERE account = ?').bind(account).first();
      if (exists) return err('此帳號已存在');
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await pbkdf2(b.password, salt);
      await env.DB.prepare(
        'INSERT INTO users (account, password_hash, salt, name, role) VALUES (?,?,?,?,?)'
      ).bind(account, hash, salt, name, b.role).run();
      return json({ ok: true });
    }

    const staffMatch = path.match(/^\/staff\/(\d+)$/);
    if (staffMatch && method === 'PUT') {
      const denied = requireRole(user, 'admin');
      if (denied) return denied;
      const id = parseInt(staffMatch[1]);
      if (id === user.id) return err('不能修改自己的帳號狀態');
      const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first();
      if (!target || target.role === 'member') return err('找不到帳號', 404);
      if (target.role === 'admin') return err('不能修改 admin 帳號');
      const b = await request.json();
      if (b.active !== undefined) {
        await env.DB.prepare('UPDATE users SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run();
      }
      if (b.role && ['staff', 'boss'].includes(b.role)) {
        await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(b.role, id).run();
      }
      if (b.password) {
        if (b.password.length < 6) return err('密碼至少 6 個字元');
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await pbkdf2(b.password, salt);
        await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, id).run();
      }
      return json({ ok: true });
    }

    return err('找不到此 API', 404);
  } catch (e) {
    if (e instanceof SyntaxError) return err('請求格式錯誤');
    return err('伺服器錯誤：' + e.message, 500);
  }
}
