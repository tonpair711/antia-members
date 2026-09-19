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
