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
