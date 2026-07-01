const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const targetUrl = 'https://futbol-libres.su/eventos.html?r=aHR0cHM6Ly92aWR6ZW52aXZvLmNjL2NhbmFsLnBocD9zdHJlYW09ZHNwb3J0cw==';
  
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    let m3u8Url = null;
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('.m3u8') && url.includes('token=')) {
        m3u8Url = url;
      }
      request.continue();
    });
    
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    if (m3u8Url) {
      res.status(200).json({ success: true, url: m3u8Url });
    } else {
      res.status(404).json({ success: false, error: 'Stream no encontrado' });
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) await browser.close();
  }
};