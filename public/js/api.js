// 共用 API 封裝與登入狀態管理
const API = {
  token: localStorage.getItem('token') || '',
  role: localStorage.getItem('role') || '',
  name: localStorage.getItem('name') || '',

  async call(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch('/api' + path, { ...options, headers });
    const data = await res.json().catch(() => ({ error: '回應格式錯誤' }));
    if (res.status === 401 && this.token) {
      this.logout(); // token 過期
      return data;
    }
    if (!res.ok) throw Object.assign(new Error(data.error || '發生錯誤'), { code: data.code });
    return data;
  },

  get(path) { return this.call(path); },
  post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
  put(path, body) { return this.call(path, { method: 'PUT', body: JSON.stringify(body) }); },

  setSession(token, role, name) {
    this.token = token; this.role = role; this.name = name;
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('name', name);
  },

  logout() {
    localStorage.clear();
    location.href = '/index.html';
  },

  // 依角色導向對應頁面
  homeFor(role) {
    if (role === 'member') return '/member.html';
    if (role === 'staff') return '/staff.html';
    return '/admin.html'; // boss / admin
  },

  // 頁面守衛：未登入或角色不符就踢回登入頁
  guard(allowedRoles) {
    if (!this.token || !allowedRoles.includes(this.role)) {
      location.href = '/index.html';
      return false;
    }
    return true;
  },
};

// 共用小工具
function fmtDate(s) {
  if (!s) return '';
  // D1 存 UTC，轉台灣時間顯示
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
// 來訪紀錄用：2026/09/17（四）14:30
function fmtVisit(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  const p = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'narrow', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.year}/${p.month}/${p.day}（${p.weekday}）${p.hour}:${p.minute}`;
}
// datetime-local 輸入框的預設值：台灣現在時間 YYYY-MM-DDTHH:MM
function nowTaipeiInput() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16);
}
// 塞進 innerHTML 前一律跳脫，避免姓名／備註被當成 HTML 執行
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDateOnly(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}
function txTypeName(t) {
  return { earn: '消費累點', redeem: '兌換扣點', adjust: '手動調整' }[t] || t;
}
// iOS Safari 有時候會在 type=number 的欄位上被系統的「插入驗證碼」QuickType 提示列卡住，
// 導致鍵盤打得出來但完全打不進欄位。改用 type=text + inputmode=numeric 搭配這個即時過濾，
// 不讓瀏覽器自己做數字驗證，行為更穩定；allowNegative 給扣點這種可以填負數的欄位用。
function sanitizeNumericInput(el, allowNegative = false) {
  el.addEventListener('input', () => {
    let v = allowNegative ? el.value.replace(/[^-0-9]/g, '') : el.value.replace(/[^0-9]/g, '');
    if (allowNegative) {
      const neg = v.startsWith('-');
      v = (neg ? '-' : '') + v.replace(/-/g, '');
    }
    if (v !== el.value) el.value = v;
  });
}
function showMsg(el, text, ok = false) {
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'success' : 'error');
  if (ok) setTimeout(() => { el.className = 'msg'; }, 3000);
}
