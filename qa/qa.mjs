// Logged-out browser QA: fresh Chromium context per viewport, no stored state.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = (process.env.SITE || 'https://sopavo.com/').replace(/\/?$/, '/');
const EMAIL = 'yonatanzlit@stayinnovation.com';
const LESSONS = JSON.parse(fs.readFileSync(new URL('./lessons.json', import.meta.url)));
const PAGES = ['', 'about.html', 'contact.html', 'privacy.html', 'responsible-play.html', 'cheat-sheet.html', ...LESSONS.map(l => `lessons/${l.slug}.html`)];
const results = []; const fail = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fail.push(name); };
fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
for (const vp of [{ name: 'phone', width: 390, height: 844, mobile: true }, { name: 'desktop', width: 1366, height: 900, mobile: false }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  for (const p of PAGES) {
    const r = await page.goto(SITE + p, { waitUntil: 'networkidle' });
    check(`[${vp.name}] ${p || 'home'} loads`, r.status() === 200, `HTTP ${r.status()} ${page.url()}`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`[${vp.name}] ${p || 'home'} no sideways scroll`, sw <= 1, `overflow ${sw}px`);
    const body = await page.innerText('body');
    check(`[${vp.name}] ${p || 'home'} no placeholder copy`, !/prototype|\bMVP\b|private preview|lorem|888|riverwise/i.test(body));
    check(`[${vp.name}] ${p || 'home'} footer shows contact email`, (await page.$(`footer a[href="mailto:${EMAIL}"]`)) !== null && await page.isVisible(`footer a[href="mailto:${EMAIL}"]`));
    const seo = await page.evaluate(() => ({ t: document.title, d: document.querySelector('meta[name=description]')?.content || '', c: document.querySelector('link[rel=canonical]')?.href || '', h1: document.querySelectorAll('h1').length }));
    check(`[${vp.name}] ${p || 'home'} title, description, canonical, one h1`, seo.t.length > 10 && seo.d.length > 50 && seo.c.startsWith('https://sopavo.com/') && seo.h1 === 1, JSON.stringify(seo).slice(0, 160));
    const small = await page.$$eval('input:not(.hp):not([type=checkbox]), button, .button', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map(e => (e.textContent || e.name || '').trim().slice(0, 20)));
    check(`[${vp.name}] ${p || 'home'} tap targets at least 40px tall`, small.length === 0, small.join(','));
    await page.screenshot({ path: `shots/${vp.name}-${(p || 'home').replace('.html', '').replace('lessons/', 'lesson-')}.png`, fullPage: true });
  }
  // every internal link resolves
  await page.goto(SITE, { waitUntil: 'networkidle' });
  const links = new Set();
  const anchors = [];
  for (const p of PAGES) { await page.goto(SITE + p); (await page.$$eval('a[href]', as => as.map(a => a.href))).forEach(h => { links.add(h.split('#')[0]); if (h.includes('#') && h.startsWith(SITE)) anchors.push([p, h]); }); }
  const seenA = new Set();
  for (const [from, h] of anchors) { if (seenA.has(h)) continue; seenA.add(h); const id = h.split('#')[1]; if (!id || id === 'main') continue;
    await page.goto(h.split('#')[0]); check(`[${vp.name}] anchor #${id} exists on ${h.split('#')[0].replace(SITE, '') || 'home'}`, (await page.$(`[id="${id}"]`)) !== null, `linked from ${from || 'home'}`); }
  for (const l of links) {
    if (l.startsWith('mailto:') || l.startsWith('tel:')) continue;
    const r = await page.request.get(l, { maxRedirects: 5 }).catch(e => ({ status: () => 0, headers: () => ({}) }));
    const cf = r.status() === 403 && r.headers()['cf-mitigated'] === 'challenge' && !l.startsWith(SITE);
    check(`[${vp.name}] link ${l}`, (r.status() >= 200 && r.status() < 400) || cf, cf ? 'external site: Cloudflare bot challenge, opens in real browsers' : `HTTP ${r.status()}`);
  }
  // navigation
  await page.goto(SITE, { waitUntil: 'networkidle' });
  if (vp.mobile) {
    await page.click('.menu-toggle');
    check(`[${vp.name}] mobile menu opens`, await page.isVisible('#mobile-nav'));
    await page.screenshot({ path: `shots/${vp.name}-menu.png` });
    await page.click('#mobile-nav a[href="about.html"]'); await page.waitForURL(/about/);
    check(`[${vp.name}] mobile menu → About`, page.url().includes('about.html'));
    await page.goto(SITE, { waitUntil: 'networkidle' });
  } else {
    await page.click('.site-header nav a[href="contact.html"]'); await page.waitForURL(/contact/);
    check(`[${vp.name}] header nav → Contact`, page.url().includes('contact.html'));
    await page.goto(SITE, { waitUntil: 'networkidle' });
  }
  check(`[${vp.name}] practice lab not on site`, (await page.$('#practice')) === null && !(await page.innerText('body')).includes('scenarios explored'));
  // lessons
  const n = await page.$$eval('[data-lesson]', b => b.length);
  check(`[${vp.name}] 6 lessons listed`, n === 6, `${n}`);
  for (let i = 0; i < n; i++) {
    await page.click(`[data-lesson="${i}"]`);
    await page.waitForSelector('#content-dialog[open]');
    const t = await page.innerText('#dialog-content');
    await page.click('.quiz-options button >> nth=0');
    const fb = await page.isVisible('.quiz-feedback');
    if (i === 0) await page.screenshot({ path: `shots/${vp.name}-lesson.png` });
    await page.click('.complete-lesson');
    await page.waitForSelector('#content-dialog', { state: 'hidden' });
    check(`[${vp.name}] lesson ${i + 1} opens, quiz answers, completes`, t.length > 400 && fb);
  }
  check(`[${vp.name}] progress shows 6 of 6`, (await page.innerText('#lesson-progress')).startsWith('6 of 6'));
  // calculator
  await page.fill('#pot-input', '100'); await page.fill('#bet-input', '50');
  check(`[${vp.name}] calculator 100/50 = 25%`, (await page.innerText('#equity-result')).replace(/\s/g, '') === '25%', await page.innerText('#equity-result'));
  await page.fill('#pot-input', '200'); await page.fill('#bet-input', '100');
  check(`[${vp.name}] calculator 200/100 = 25%`, (await page.innerText('#equity-result')).replace(/\s/g, '') === '25%');
  await page.fill('#pot-input', '100'); await page.fill('#bet-input', '100');
  const e3 = (await page.innerText('#equity-result')).replace(/\s/g, '');
  check(`[${vp.name}] calculator 100/100 = 33.3%`, /^33\.3/.test(e3), e3);
  await page.fill('#bet-input', '');
  check(`[${vp.name}] calculator blank input handled`, !/NaN|Infinity/.test(await page.innerText('.odds-tool')));
  await page.locator('#tools').screenshot({ path: `shots/${vp.name}-toolkit.png` });
  // rankings
  await page.click('.rank-row button >> nth=0');
  check(`[${vp.name}] hand ranking expands`, (await page.getAttribute('.rank-row button >> nth=0', 'aria-expanded')) === 'true');
  check(`[${vp.name}] 10 hand rankings`, (await page.$$eval('.rank-row', r => r.length)) === 10);
  // contact
  await page.goto(SITE + 'contact.html');
  const mail = await page.$$eval('a[href^="mailto:"]', as => as.map(a => a.getAttribute('href')));
  check(`[${vp.name}] contact mailto correct`, mail.length > 0 && mail.every(m => m === 'mailto:' + EMAIL), mail.join(','));
  await page.goto(SITE + 'responsible-play.html');
  check(`[${vp.name}] helpline tel link`, (await page.$('a[href="tel:08088020133"]')) !== null);
  // lesson pages: quiz works and saves progress
  await page.goto(SITE + `lessons/${LESSONS[2].slug}.html`);
  await page.click('.static-quiz [data-answer] >> nth=0');
  check(`[${vp.name}] lesson page quiz gives feedback`, await page.isVisible('.static-quiz .quiz-feedback'));
  check(`[${vp.name}] lesson page has next link`, (await page.$('.lesson-pager a.next')) !== null);
  // email sign-up (FormSubmit mocked: no real email sent by QA)
  let posted = null, mode = 'ok';
  await ctx.route('https://formsubmit.co/**', async route => { posted = JSON.parse(route.request().postData() || '{}');
    await route.fulfill(mode === 'ok' ? { status: 200, contentType: 'application/json', body: '{"success":"true"}' } : { status: 500, contentType: 'application/json', body: '{"success":"false"}' }); });
  await page.goto(SITE, { waitUntil: 'networkidle' });
  const f = 'form[data-signup="home"]', st = `${f} .signup-status`;
  await page.click(`${f} button[type=submit]`);
  check(`[${vp.name}] sign-up: empty email rejected`, /valid email/.test(await page.innerText(st)) && posted === null);
  await page.fill(`${f} input[name=email]`, 'not-an-email'); await page.click(`${f} button[type=submit]`);
  check(`[${vp.name}] sign-up: bad email rejected`, /valid email/.test(await page.innerText(st)) && posted === null);
  await page.fill(`${f} input[name=email]`, 'qa.test@example.com'); await page.click(`${f} button[type=submit]`);
  check(`[${vp.name}] sign-up: 18+ required`, /18 or over/.test(await page.innerText(st)) && posted === null);
  await page.check(`${f} input[name=adult]`); await page.click(`${f} button[type=submit]`);
  check(`[${vp.name}] sign-up: consent required`, /tick the box/.test(await page.innerText(st)) && posted === null);
  await page.check(`${f} input[name=consent]`); mode = 'fail'; await page.click(`${f} button[type=submit]`);
  await page.waitForFunction(s => /didn’t go through/.test(document.querySelector(s)?.textContent || ''), st);
  check(`[${vp.name}] sign-up: server error shown, button re-enabled`, !(await page.isDisabled(`${f} button[type=submit]`)));
  for (let k = errors.length - 1; k >= 0; k--) if (/status of 500/.test(errors[k])) errors.splice(k, 1); // our own simulated failure
  mode = 'ok'; posted = null; await page.click(`${f} button[type=submit]`);
  await page.waitForSelector('#signup .signup-done');
  check(`[${vp.name}] sign-up: success sends email + 18+ + consent + source`, posted && posted.email === 'qa.test@example.com' && posted.confirmed_18_plus === 'yes' && posted.email_consent === 'yes' && posted.source === 'home', JSON.stringify(posted).slice(0, 200));
  await page.locator('#signup').screenshot({ path: `shots/${vp.name}-signup-done.png` });
  await page.click('#signup .signup-done a'); await page.waitForURL(/cheat-sheet/);
  check(`[${vp.name}] sign-up → cheat sheet opens`, (await page.innerText('h1')).includes('cheat sheet'));
  const rows = await page.$$eval('.cheat-table tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
  check(`[${vp.name}] cheat sheet pot odds match calculator formula`, rows.length === 6 && rows.every(([p, c, n]) => Math.abs(parseFloat(n) - (+c / (+p + 2 * +c) * 100)) < 0.06), JSON.stringify(rows));
  await page.goto(SITE + `lessons/${LESSONS[0].slug}.html`);
  check(`[${vp.name}] lesson page has sign-up form`, (await page.$('form[data-signup="lesson-1"]')) !== null);
  const og = await page.request.get(SITE + 'og.png');
  check(`[${vp.name}] share image og.png served`, og.status() === 200 && (og.headers()['content-type'] || '').includes('png'));
  check(`[${vp.name}] no console errors`, errors.length === 0, errors.join(' | ').slice(0, 300));
  await ctx.close();
}
await browser.close();
const out = `SITE ${SITE}\n${new Date().toISOString()}\n` + results.join('\n') + `\n\n${results.length - fail.length}/${results.length} passed\n`;
fs.writeFileSync('shots/results.txt', out); console.log(out);
process.exit(fail.length ? 1 : 0);
