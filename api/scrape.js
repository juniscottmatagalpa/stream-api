const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { data } = await axios.get('https://futbol-libres.su/agenda/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    const eventos = [];
    
    // Buscar todos los elementos de la agenda (basado en la estructura real)
    $('li, p, div').each((i, elem) => {
      const $el = $(elem);
      const html = $el.html();
      
      // Buscar enlaces que contengan "eventos.html?r="
      const tieneEnlaces = html && html.includes('eventos.html?r=');
      
      if (tieneEnlaces) {
        // Extraer el texto del elemento para obtener el título
        const textoCompleto = $el.text().trim();
        
        // Buscar patrón de título: "Copa Mundial: Suiza vs Colombia 16:00" o similar
        const tituloMatch = textoCompleto.match(/^([^[]+?)(?:\d+:\d+|\[|$)/);
        let titulo = tituloMatch ? tituloMatch[1].trim() : 'Evento';
        
        // Limpiar el título (quitar "Ver" al inicio si existe)
        titulo = titulo.replace(/^Ver\s+/i, '');
        
        // Extraer hora si existe
        const horaMatch = textoCompleto.match(/(\d+:\d+)/);
        const hora = horaMatch ? horaMatch[1] : '';
        
        // Buscar todos los enlaces dentro de este elemento
        const canales = [];
        
        $el.find('a[href*="eventos.html?r="]').each((j, link) => {
          const $link = $(link);
          const href = $link.attr('href');
          const textoLink = $link.text().trim();
          
          // Extraer calidad (1080p, 720p, etc.)
          const calidadMatch = textoLink.match(/(\d+p)/i);
          const calidad = calidadMatch ? calidadMatch[1] : 'SD';
          
          // Extraer nombre del canal (todo antes de "Calidad" o la calidad)
          let nombre = textoLink
            .replace(/Calidad\s+\d+p/i, '')
            .replace(/\d+p/i, '')
            .replace(/\(Recomendado\)/i, '')
            .replace(/\(Solo LATAM\)/i, '')
            .replace(/\(Solo Colombia\)/i, '')
            .replace(/OP\s+\d+/i, '')
            .replace(/\|/g, '')
            .trim();
          
          // Decodificar base64
          const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
          let urlDecodificada = '';
          
          if (base64Match && base64Match[1]) {
            try {
              // Asegurar que el base64 tenga el padding correcto
              let base64 = base64Match[1];
              while (base64.length % 4 !== 0) {
                base64 += '=';
              }
              urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
            } catch (e) {
              console.error('Error decodificando base64:', e.message);
              urlDecodificada = '';
            }
          }
          
          if (urlDecodificada && nombre) {
            canales.push({
              nombre: nombre || 'Canal',
              calidad: calidad,
              url: urlDecodificada,
              urlOriginal: href
            });
          }
        });
        
        // Solo agregar si encontramos canales
        if (canales.length > 0) {
          // Verificar si ya existe este evento (para no duplicar)
          const existe = eventos.some(e => e.titulo === titulo);
          
          if (!existe) {
            eventos.push({
              titulo: titulo,
              hora: hora,
              canales: canales
            });
          }
        }
      }
    });
    
    // Si no encontramos eventos, intentar método alternativo
    if (eventos.length === 0) {
      // Buscar todos los enlaces de eventos en la página
      $('a[href*="eventos.html?r="]').each((i, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const textoLink = $link.text().trim();
        
        // Intentar encontrar el título del partido en elementos cercanos
        const $parent = $link.closest('li, p, div');
        const textoParent = $parent.text();
        const tituloMatch = textoParent.match(/^([^[]+?)(?:\d+:\d+|\[|$)/);
        const titulo = tituloMatch ? tituloMatch[1].trim().replace(/^Ver\s+/i, '') : 'Evento';
        
        const calidadMatch = textoLink.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';
        
        let nombre = textoLink
          .replace(/Calidad\s+\d+p/i, '')
          .replace(/\d+p/i, '')
          .replace(/\(Recomendado\)/i, '')
          .replace(/\|/g, '')
          .trim();
        
        const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
        let urlDecodificada = '';
        
        if (base64Match && base64Match[1]) {
          try {
            let base64 = base64Match[1];
            while (base64.length % 4 !== 0) {
              base64 += '=';
            }
            urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
          } catch (e) {
            console.error('Error decodificando:', e);
          }
        }
        
        if (urlDecodificada) {
          const eventoExistente = eventos.find(e => e.titulo === titulo);
          
          if (eventoExistente) {
            eventoExistente.canales.push({
              nombre: nombre || 'Canal',
              calidad,
              url: urlDecodificada,
              urlOriginal: href
            });
          } else {
            const horaMatch = textoParent.match(/(\d+:\d+)/);
            eventos.push({
              titulo,
              hora: horaMatch ? horaMatch[1] : '',
              canales: [{
                nombre: nombre || 'Canal',
                calidad,
                url: urlDecodificada,
                urlOriginal: href
              }]
            });
          }
        }
      });
    }
    
    res.status(200).json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: eventos.length,
      eventos: eventos
    });
    
  } catch (error) {
    console.error('Error en scrape:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      eventos: []
    });
  }
};
