// Logged-out browser QA: fresh Chromium context per viewport, no stored state.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = (process.env.SITE || 'https://sopavo.com/').replace(/\/?$/, '/');
const EMAIL = 'yonatanzlit@stayinnovation.com';
const PAGES = ['', 'about.html', 'contact.html', 'privacy.html', 'responsible-play.html'];
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
    check(`[${vp.name}] ${p || 'home'} no placeholder copy`, !/prototype|\bMVP\b|private preview|lorem|888/i.test(body));
    await page.screenshot({ path: `shots/${vp.name}-${(p || 'home').replace('.html', '')}.png`, fullPage: true });
  }
  // every internal link resolves
  await page.goto(SITE, { waitUntil: 'networkidle' });
  const links = new Set();
  for (const p of PAGES) { await page.goto(SITE + p); (await page.$$eval('a[href]', as => as.map(a => a.href))).forEach(h => links.add(h.split('#')[0])); }
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
  check(`[${vp.name}] no console errors`, errors.length === 0, errors.join(' | ').slice(0, 300));
  await ctx.close();
}
await browser.close();
const out = `SITE ${SITE}\n${new Date().toISOString()}\n` + results.join('\n') + `\n\n${results.length - fail.length}/${results.length} passed\n`;
fs.writeFileSync('shots/results.txt', out); console.log(out);
process.exit(fail.length ? 1 : 0);
