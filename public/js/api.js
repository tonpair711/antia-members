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
    if (!res.ok) throw new Error(data.error || '發生錯誤');
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
function fmtDateOnly(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}
function txTypeName(t) {
  return { earn: '消費累點', redeem: '兌換扣點', adjust: '手動調整' }[t] || t;
}
function showMsg(el, text, ok = false) {
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'success' : 'error');
  if (ok) setTimeout(() => { el.className = 'msg'; }, 3000);
}
