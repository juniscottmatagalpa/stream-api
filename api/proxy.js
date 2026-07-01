const https = require('https');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const targetUrl = 'https://vidzenvivo.cc/canal.php?stream=dsports';
  
  try {
    // Obtener el HTML original
    const html = await new Promise((resolve, reject) => {
      https.get(targetUrl, {
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Referer': 'https://futbol-libres.su/'
        }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      }).on('error', reject);
    });
    
    // Inyectar script espía que capturará el m3u8
    const injectedScript = `
      <script>
        (function() {
          // Interceptar XMLHttpRequest
          const originalOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            if (url.includes('.m3u8') && url.includes('token=')) {
              // Enviar al parent (tu página de GitHub)
              window.parent.postMessage({
                type: 'STREAM_URL',
                url: url
              }, '*');
            }
            return originalOpen.apply(this, arguments);
          };
          
          // También interceptar fetch
          const originalFetch = window.fetch;
          window.fetch = function(url) {
            if (typeof url === 'string' && url.includes('.m3u8')) {
              window.parent.postMessage({
                type: 'STREAM_URL', 
                url: url
              }, '*');
            }
            return originalFetch.apply(this, arguments);
          };
        })();
      </script>
    `;
    
    // Insertar el script antes del </head> o </body>
    const modifiedHtml = html.replace('</head>', injectedScript + '</head>');
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(modifiedHtml);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
