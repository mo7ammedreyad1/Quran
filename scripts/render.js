// باذن الله — سكريبت رندر أوفق عبر Playwright
// بيشغّل سيرفر محلي بسيط، يفتح Chrome الحقيقي (مش Chromium الافتراضي، عشان AAC يشتغل صح)،
// يفتح index.html، يستنى لحد ما الرندر يخلص، ويحفظ ملف الفيديو على القرص.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8934;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  const surah   = process.env.OFOQ_SURAH   || '6';
  const ayah    = process.env.OFOQ_AYAH    || '6';
  const reciter = process.env.OFOQ_RECITER || 'Alafasy_128kbps';
  const fps     = process.env.OFOQ_FPS     || '60';
  const width   = process.env.OFOQ_WIDTH   || '1920';
  const height  = process.env.OFOQ_HEIGHT  || '1080';
  const outDir  = process.env.OFOQ_OUTDIR  || path.join(ROOT, 'output');

  fs.mkdirSync(outDir, { recursive: true });

  console.log('بسم الله — بدء السيرفر المحلي...');
  const server = await startServer();

  console.log('فتح Chrome...');
  const browser = await chromium.launch({
    channel: 'chrome', // كروم حقيقي، مش Chromium الافتراضي — عشان ترميز AAC يشتغل صح
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('console', (msg) => console.log('[page]', msg.text()));
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));

  const url = `http://localhost:${PORT}/index.html?surah=${surah}&ayah=${ayah}&reciter=${reciter}&fps=${fps}&width=${width}&height=${height}`;
  console.log('فتح الصفحة: ' + url);
  await page.goto(url, { waitUntil: 'load' });

  console.log('جاري انتظار انتهاء الرندر (هيستنى لحد 10 دقايق)...');
  const TIMEOUT_MS = 10 * 60 * 1000;
  const start = Date.now();
  let status = 'pending';

  while (Date.now() - start < TIMEOUT_MS) {
    status = await page.evaluate(() => window.__ofoqStatus || 'pending');
    if (status === 'done' || status === 'error') break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (status === 'error') {
    const errMsg = await page.evaluate(() => window.__ofoqError || 'unknown error');
    await browser.close();
    server.close();
    throw new Error('فشل الرندر داخل الصفحة: ' + errMsg);
  }

  if (status !== 'done') {
    await browser.close();
    server.close();
    throw new Error('انتهى الوقت المسموح (timeout) قبل ما الرندر يخلص');
  }

  console.log('الرندر خلص، جاري سحب الفيديو...');
  const base64 = await page.evaluate(() => window.__ofoqBase64);
  const filename = await page.evaluate(() => window.__ofoqFilename || 'output.mp4');

  const buffer = Buffer.from(base64, 'base64');
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`تم حفظ الفيديو في: ${outPath} (${(buffer.length / 1024 / 1024).toFixed(2)} ميجا)`);

  await browser.close();
  server.close();

  console.log('انتهى باذن الله ✅');
}

main().catch((err) => {
  console.error('خطأ فادح:', err);
  process.exit(1);
});
