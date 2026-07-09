const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { data: html } = await axios.get('https://futbol-libres.su/agenda/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(html);
    const eventos = [];
    let eventoActual = null;

    $('li').each((i, elem) => {
      const $elem = $(elem);
      const links = $elem.find('a[href*="eventos.html?r="]');
      
      if (links.length === 0) return;

      const tituloLink = $elem.find('a[href="#"]').first();
      
      if (tituloLink.length > 0) {
        const texto = tituloLink.text().trim();
        const horaMatch = texto.match(/(\d{1,2}:\d{2})$/);
        const hora = horaMatch ? horaMatch[1] : '';
        const titulo = texto.replace(/\d{1,2}:\d{2}$/, '').trim();
        
        if (titulo && titulo.length > 3) {
          eventoActual = { titulo, hora, canales: [] };
          eventos.push(eventoActual);
        }
      }

      if (eventoActual) {
        links.each((j, link) => {
          const $link = $(link);
          const href = decodeURIComponent($link.attr('href') || '');
          const texto = $link.text().trim();
          
          const rMatch = href.match(/[?&]r=([A-Za-z0-9+/=_-]+)/);
          if (!rMatch) return;
          
          try {
            let base64 = rMatch[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = 4 - (base64.length % 4);
            if (pad !== 4) base64 += '='.repeat(pad);
            
            const url = Buffer.from(base64, 'base64').toString('utf-8');
            
            if (url.startsWith('http')) {
              const calidad = (texto.match(/(\d{3,4}p)/i) || ['', 'SD'])[1];
              const nombre = texto.replace(/Calidad\s+\d+p|\d+p|\(.*?\)|\[.*?\]|\|/gi, '').trim() || `Canal ${j+1}`;
              
              if (!eventoActual.canales.some(c => c.urlOriginal === url)) {
                eventoActual.canales.push({ nombre, calidad, urlOriginal: url });
              }
            }
          } catch (e) {}
        });
      }
    });

    const validos = eventos.filter(e => e.canales.length > 0);

    if (validos.length === 0) {
      validos.push({
        titulo: 'Fútbol Libre',
        hora: '',
        canales: [{ nombre: 'DSports', calidad: '1080p', urlOriginal: 'https://esvidzypro.sbs/dsportsar.php' }]
      });
    }

    validos.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

    return res.json({ success: true, eventos: validos });

  } catch (error) {
    return res.json({
      success: true,
      eventos: [{
        titulo: 'Fútbol Libre',
        hora: '',
        canales: [{ nombre: 'DSports', calidad: '1080p', urlOriginal: 'https://esvidzypro.sbs/dsportsar.php' }]
      }]
    });
  }
};
