// assets/print/src/*.html を A4 の PDF にする。最後に全部を1つにまとめた all.pdf も作る
//   node assets/print/build.js           → assets/print/*.pdf
//   node assets/print/build.js private   → assets/print/private/*.pdf（QRカード。公開しない）
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const priv = process.argv[2] === 'private';
  const src = path.join(__dirname, priv ? 'private' : 'src');
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.html')).sort();
  const br = await chromium.launch();
  const page = await br.newPage();
  const out = [];
  for (const f of files) {
    await page.goto('file://' + path.join(src, f), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const pdf = path.join(priv ? src : __dirname, f.replace('.html', '.pdf'));
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
    out.push(pdf);
    console.log('pdf', path.basename(pdf));
  }
  await br.close();
  console.log(JSON.stringify(out));
})();
