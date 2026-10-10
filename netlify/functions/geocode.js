// netlify/functions/geocode.js
// Proxy per a Nominatim OpenStreetMap — evita CORS des del navegador
exports.handler = async (event) => {
  const q = event.queryStringParameters?.q;
  if (!q) return { statusCode: 400, body: JSON.stringify({ error: 'missing q' }) };

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, {
      headers: {
        'Accept-Language': 'ca,es',
        'User-Agent': 'LaTonteriadAngles/1.0 (admin@latonteriadelangles.com)'
      }
    });
    if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: 'nominatim error', status: resp.status }) };
    const data = await resp.json();
    if (!data || !data.length) return { statusCode: 200, body: JSON.stringify({ found: false }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
