const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('=== INICIANDO SCRAPE ===');
    
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
    let contador = 0;

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
          console.log(`Evento ${++contador}: ${titulo}`);
        }
      }

      if (eventoActual) {
        links.each((j, link) => {
          const $link = $(link);
          const hrefCrudo = $link.attr('href') || '';
          
          console.log(`  Link crudo encontrado: ${hrefCrudo.substring(0, 80)}...`);
          
          let href;
          try {
            href = decodeURIComponent(hrefCrudo);
          } catch (e) {
            href = hrefCrudo;
          }
          
          const rMatch = href.match(/[?&]r=([A-Za-z0-9+/=_-]+)/);
          
          if (!rMatch) {
            console.log('  ❌ No se encontró parámetro r');
            return;
          }
          
          console.log(`  Base64 extraído: ${rMatch[1].substring(0, 50)}...`);
          
          try {
            let base64 = rMatch[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = 4 - (base64.length % 4);
            if (pad !== 4) base64 += '='.repeat(pad);
            
            const url = Buffer.from(base64, 'base64').toString('utf-8');
            console.log(`  ✅ URL decodificada: ${url}`);
            
            if (url.startsWith('http')) {
              const texto = $link.text().trim();
              const calidad = (texto.match(/(\d{3,4}p)/i) || ['', 'SD'])[1];
              const nombre = texto.replace(/Calidad\s+\d+p|\d+p|\(.*?\)|\[.*?\]|\|/gi, '').trim() || `Canal ${j+1}`;
              
              if (!eventoActual.canales.some(c => c.urlOriginal === url)) {
                eventoActual.canales.push({ nombre, calidad, urlOriginal: url });
                console.log(`  📺 Canal agregado: ${nombre}`);
              }
            } else {
              console.log(`  ❌ URL no válida: ${url}`);
            }
          } catch (e) {
            console.log(`  ❌ Error decodificando: ${e.message}`);
          }
        });
      }
    });

    const validos = eventos.filter(e => e.canales.length > 0);
    
    console.log(`\n=== RESUMEN ===`);
    console.log(`Eventos encontrados: ${validos.length}`);
    validos.forEach((e, i) => {
      console.log(`${i+1}. ${e.titulo} - ${e.canales.length} canales`);
      e.canales.forEach(c => console.log(`   - ${c.nombre}: ${c.urlOriginal}`));
    });

    if (validos.length === 0) {
      throw new Error('No se encontraron eventos');
    }

    return res.json({ success: true, eventos: validos });

  } catch (error) {
    console.log('Error:', error.message);
    console.log('Devolviendo evento por defecto');
    
    return res.json({
      success: true,
      eventos: [{
        titulo: 'Fútbol online',
        hora: 'En vivo',
        canales: [{
          nombre: 'DSports',
          calidad: '1080p',
          urlOriginal: 'https://esvidzypro.sbs/dsportsar.php'
        }]
      }]
    });
  }
};
