// 喜翻官網共用小工具：手機版導覽選單開關 + 聯絡表單送出
document.addEventListener('DOMContentLoaded', () => {
  // 斷行整理（2026-09-19 Steve 回報手機上很多地方文字斷行難看）
  // 舊版 iPhone Safari 等不支援 CSS text-wrap: pretty，會出現最後一行只剩 1～2 個字。這裡不靠 CSS：
  // ①數字加單位（5-10 分鐘、1.5 歲、10:00）綁在一起不准拆開；②每段最後 4 個字綁在一起，
  // 不會單獨掉一兩個字到下一行。全用 createElement／textContent，不碰 innerHTML。
  const UNIT = /[A-Za-z0-9][A-Za-z0-9.:\-]*\s?[歲分鐘點堂天月日號人場次篇個項題步秒週]{1,2}/g;
  const nb = (t) => { const e = document.createElement('span'); e.className = 'nb'; e.textContent = t; return e; };
  function textNodes(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue.trim() && !n.parentElement.closest('.nb, script, style, textarea')) out.push(n);
    return out;
  }
  function tidyBreaks(root) {
    const sel = 'p, li, h1, h2, h3, .section-sub, .tag-note, .notice-inner span, .footer-bottom';
    (root || document).querySelectorAll(sel).forEach((el) => {
      if (el.dataset.tidy) return;
      el.dataset.tidy = '1';
      textNodes(el).forEach((n) => {
        const txt = n.nodeValue;
        UNIT.lastIndex = 0;
        if (!UNIT.test(txt)) return;
        UNIT.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = UNIT.exec(txt))) {
          if (m.index > last) frag.append(txt.slice(last, m.index));
          frag.append(nb(m[0]));
          last = m.index + m[0].length;
        }
        if (last < txt.length) frag.append(txt.slice(last));
        n.replaceWith(frag);
      });
      const nodes = textNodes(el);
      const tail = nodes[nodes.length - 1];
      if (!tail) return;
      const chars = Array.from(tail.nodeValue.replace(/\s+$/, ''));
      if (chars.length < 8) return;
      const head = chars.slice(0, -4).join('');
      tail.replaceWith(head, nb(chars.slice(-4).join('')));
    });
  }

  // 近日課程公告列：內容在 /schedule.json，改那一個檔全站同步。讀不到就不顯示，不影響頁面
  const siteHeader = document.querySelector('header.site-header');
  if (siteHeader) {
    fetch('/schedule.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.text) return;
        const bar = document.createElement('div');
        bar.className = 'notice-bar';
        const inner = document.createElement('div');
        inner.className = 'notice-inner';
        const tag = document.createElement('strong');
        tag.textContent = d.label || '近日課程';
        const txt = document.createElement('span');
        txt.textContent = d.text;
        inner.append(tag, txt);
        (Array.isArray(d.links) ? d.links : []).forEach((l) => {
          if (!l || !l.text || typeof l.href !== 'string' || !l.href.startsWith('/')) return;
          const a = document.createElement('a');
          a.href = l.href;
          a.textContent = l.text;
          inner.append(a);
        });
        bar.append(inner);
        siteHeader.prepend(bar);
        tidyBreaks(bar);
      })
      .catch(() => {});
  }

  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  // 右下角固定「線上諮詢」圖示條（Facebook／Instagram／電話／地圖），全站都有；內容都是固定的靜態字串
  if (!document.querySelector('.fab-contact')) {
    const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('台南市新營區周武街295巷17號');
    const fab = document.createElement('div');
    fab.className = 'fab-contact';
    fab.innerHTML = '<span>線上諮詢</span>'
      + '<a href="https://www.facebook.com/Loverolling0808/" target="_blank" rel="noopener" aria-label="Facebook 粉專" style="background:#1877f2"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12"/></svg></a>'
      + '<a href="https://www.instagram.com/loverolling123/" target="_blank" rel="noopener" aria-label="Instagram" style="background:linear-gradient(45deg,#f9a03f,#e1306c,#833ab4)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>'
      + '<a href="tel:0958978122" aria-label="撥打電話 0958-978-122" style="background:#2f9e63"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg></a>'
      + '<a href="' + map + '" target="_blank" rel="noopener" aria-label="Google 地圖導航" style="background:#ea4335"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></a>';
    document.body.appendChild(fab);
  }

  // 捲動到才浮現（landing page 風格）。沒有 IntersectionObserver 就直接全部顯示
  document.documentElement.classList.add('js');
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.1 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // 捲動導覽（仿鴻綸首頁 landing.js 的 tourZoom）：固定一張大卡片，往下捲時各主題的照片連續交叉淡入淡出，
  // 文字跟著上下位移；opacity = 1 - 1.3 * |i - 進度|。沒有 JS、或系統設定「減少動態」時退回直排卡片。
  (function initTour() {
    const track = document.querySelector('.tour');
    if (!track || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const slides = Array.from(track.querySelectorAll('.tour-slide'));
    const dots = Array.from(track.querySelectorAll('.tour-dots i'));
    const n = slides.length;
    if (n < 2) return;
    const hdr = document.querySelector('header.site-header');
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    track.classList.add('tour-live');
    track.style.setProperty('--n', n);
    let ticking = false;
    function update() {
      ticking = false;
      const hdrH = hdr ? hdr.offsetHeight : 0;
      track.style.setProperty('--hdr', hdrH + 'px');
      const r = track.getBoundingClientRect();
      const total = Math.max(1, r.height - (window.innerHeight - hdrH));
      const p = clamp((hdrH - r.top) / total, 0, 1);
      const cont = p * (n - 1);
      const idx = Math.min(n - 1, Math.round(cont));
      slides.forEach((s, i) => {
        const off = i - cont;
        const o = clamp(1 - 1.3 * Math.abs(off), 0, 1);
        s.style.opacity = o.toFixed(3);
        s.style.zIndex = off >= 0 ? String(10 - Math.ceil(off)) : '20';
        s.classList.toggle('is-active', o > 0.85);
        const cap = s.querySelector('.tour-cap');
        if (cap) {
          cap.style.transform = 'translateY(' + (8 * off).toFixed(2) + 'vh)';
          cap.style.opacity = clamp(1 - 1.7 * Math.abs(off), 0, 1).toFixed(3);
        }
        const fg = s.querySelector('.tour-fg');
        if (fg) fg.style.transform = 'scale(' + (1 + Math.abs(off) * 0.08).toFixed(3) + ')';
      });
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    window.addEventListener('load', req);
    update();
  })();

  // 數字橫幅（仿鴻綸 statBanner）：背景視差＋進入畫面時數字從 0 跳到實際值。
  // 「累計瀏覽人次」來自 /api/visit 的真實數字，讀不到就把這一格拿掉，不顯示假數字。
  (function initStats() {
    const banner = document.querySelector('.stat-banner');
    if (!banner) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bg = banner.querySelector('.stat-bg');
    const nums = Array.from(banner.querySelectorAll('.stat-num'));
    const fmt = (v, dec) => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US'));
    function setFinal(el) { el.textContent = fmt(parseFloat(el.dataset.target), parseInt(el.dataset.decimals || '0', 10)); }
    function countUp(el) {
      const target = parseFloat(el.dataset.target);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      if (!isFinite(target)) return;
      if (reduce) { setFinal(el); return; }
      const t0 = performance.now();
      const dur = 1400;
      // 用計時器而不是 rAF：分頁在背景或畫面被節流時 rAF 幾乎不跑，數字會卡在中間；計時器一定會走到最終值
      const iv = setInterval(() => {
        const t = Math.min(1, Math.max(0, (performance.now() - t0) / dur));
        el.textContent = fmt(target * (1 - Math.pow(1 - t, 3)), dec);
        if (t >= 1) clearInterval(iv);
      }, 30);
    }
    const visitEl = banner.querySelector('[data-visit]');
    const ready = visitEl && window.fetch
      ? fetch('/api/visit', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (d && typeof d.total === 'number') visitEl.dataset.target = String(d.total);
          else visitEl.closest('.stat-item').remove();
        }).catch(() => { visitEl.closest('.stat-item').remove(); })
      : Promise.resolve();
    let played = false;
    function play() {
      if (played) return;
      played = true;
      ready.then(() => banner.querySelectorAll('.stat-num').forEach(countUp));
    }
    nums.forEach((el) => { if (!el.hasAttribute('data-visit')) el.textContent = fmt(0, parseInt(el.dataset.decimals || '0', 10)); });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { play(); io.disconnect(); } }), { threshold: 0.35 });
      io.observe(banner);
    } else { play(); }
    if (!reduce && bg) {
      let tk = false;
      const upd = () => {
        tk = false;
        const r = banner.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.bottom > 0 && r.top < vh) {
          const off = (r.top + r.height / 2 - vh / 2) / vh;
          bg.style.transform = 'translateY(' + (60 * off).toFixed(1) + 'px) scale(1.08)';
        }
      };
      window.addEventListener('scroll', () => { if (!tk) { tk = true; requestAnimationFrame(upd); } }, { passive: true });
      upd();
    }
  })();

  // 累計瀏覽人次計數器：每個瀏覽器一天只送一次 POST（伺服器端也會再擋一次），其餘只讀數字。
  // 顯示在頁尾最下面；讀不到就整個不顯示，不影響頁面。
  (function visitCounter() {
    const fb = document.querySelector('.footer-bottom');
    if (!fb || !window.fetch) return;
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    let last = '';
    try { last = localStorage.getItem('xf_visit') || ''; } catch (e) { /* 無痕模式等讀不到就當沒有 */ }
    const method = last === today ? 'GET' : 'POST';
    fetch('/api/visit', { method, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.total !== 'number') return;
        if (method === 'POST') { try { localStorage.setItem('xf_visit', today); } catch (e) { /* ignore */ } }
        const el = document.createElement('div');
        el.className = 'visit-counter';
        el.append('累計瀏覽 ');
        const b = document.createElement('strong');
        b.textContent = d.total.toLocaleString('en-US');
        el.append(b, ' 人次');
        fb.prepend(el);
      })
      .catch(() => {});
  })();

  tidyBreaks();

  const form = document.getElementById('contact-form');
  if (!form) return;
  const msg = document.getElementById('form-msg');
  const submitBtn = document.getElementById('f-submit');

  function showFormMsg(text, ok) {
    msg.textContent = text;
    msg.className = 'form-msg ' + (ok ? 'success' : 'error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // 蜜罐：這個欄位一般使用者看不到也不會填，機器人才會填
    if (document.getElementById('f-website').value.trim() !== '') return;

    const token = (window.turnstile && typeof turnstile.getResponse === 'function')
      ? turnstile.getResponse()
      : (form.querySelector('[name="cf-turnstile-response"]') || {}).value;
    if (!token) {
      showFormMsg('請完成驗證方塊後再送出', false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '送出中…';
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('f-name').value,
          phone: document.getElementById('f-phone').value,
          email: document.getElementById('f-email').value,
          topic: document.getElementById('f-topic').value,
          message: document.getElementById('f-message').value,
          website: document.getElementById('f-website').value,
          token,
          page: location.pathname,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'send_failed');
      showFormMsg('已送出，我們會盡快回覆您！', true);
      form.reset();
      if (window.turnstile && typeof turnstile.reset === 'function') turnstile.reset();
    } catch (err) {
      showFormMsg('送出失敗，請稍後再試，或直接透過 Facebook 私訊我們', false);
      if (window.turnstile && typeof turnstile.reset === 'function') turnstile.reset();
    }
    submitBtn.disabled = false;
    submitBtn.textContent = '送出詢問';
  });
});
