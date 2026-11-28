'use strict';
// Email sign-up (lead capture). Delivery: FormSubmit (no server) to the Sopavo inbox.
// The first ever submission makes FormSubmit email the inbox an "Activate" link.
(function () {
  const INBOX = 'yonatanzlit@stayinnovation.com';
  const forms = document.querySelectorAll('form[data-signup]');
  const base = document.querySelector('meta[name="rw-base"]')?.content || '';
  forms.forEach(form => {
    const status = form.querySelector('.signup-status');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = form.email.value.trim();
      if (form.company && form.company.value) return; // honeypot
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { show('Please enter a valid email address.', true); form.email.focus(); return; }
      if (!form.adult.checked) { show('Please confirm you are 18 or over.', true); return; }
      if (!form.consent.checked) { show('Please tick the box so we can email you.', true); return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true; button.dataset.label = button.innerHTML; button.textContent = 'Sending…';
      try {
        const res = await fetch(`https://formsubmit.co/ajax/${INBOX}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: `Sopavo sign-up: ${email}`, _template: 'table', _captcha: 'false',
            email, confirmed_18_plus: 'yes', email_consent: 'yes',
            source: form.dataset.signup, page: location.pathname, signed_up_at: new Date().toISOString()
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === 'false' || data.success === false) throw new Error(data.message || res.status);
        try { localStorage.setItem('riverwise-signed-up', '1'); } catch (_) {}
        form.classList.add('done');
        form.innerHTML = `<div class="signup-done"><strong>You’re in. Thank you.</strong><p>Your free cheat sheet is ready now. We’ll email you when new lessons are added. Unsubscribe any time by replying “stop”.</p><a class="button primary" href="${base}cheat-sheet.html">Open the cheat sheet <span>→</span></a></div>`;
      } catch (err) {
        button.disabled = false; button.innerHTML = button.dataset.label;
        show(`That didn’t go through. Please try again, or email ${INBOX}.`, true);
      }
    });
    function show(message, isError) { status.textContent = message; status.hidden = false; status.classList.toggle('error', !!isError); }
  });
})();
