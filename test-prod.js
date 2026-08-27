const puppeteer = require('puppeteer');

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  console.log("Navigating to production Vercel URL...");
  await page.goto('https://lcl-j9vtoonp8-lcloperations.vercel.app', { waitUntil: 'networkidle0' });
  
  console.log("Done. Waiting 2s for late errors...");
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
