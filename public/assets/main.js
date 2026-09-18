// 喜翻官網共用小工具：手機版導覽選單開關 + 聯絡表單送出
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

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
