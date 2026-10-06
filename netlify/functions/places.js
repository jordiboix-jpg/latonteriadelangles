// Netlify Function — places.js
// Busca un establiment a Google Places API (New) i retorna telèfon, web, horari, valoració i enllaç a Maps.
// La GOOGLE_PLACES_KEY va a Netlify > Project configuration > Environment variables (marcada com a secreta).
//
// Ús:  GET /.netlify/functions/places?q=Nom del negoci, adreça
//
// Protecció de costos:
//  - Només demana a Google els camps imprescindibles (FieldMask).
//  - La resposta es guarda 7 dies a la CDN de Netlify: el mateix cas no torna a costar res durant una setmana.
//  - El límit diari de peticions està posat a Google Cloud (Cuotas).

const https = require('https');

// Webs que poden cridar aquesta funció (la publicada i el desenvolupament en local)
const ORIGENS_PERMESOS = [
  'https://latonteriadelangles.com',
  'https://www.latonteriadelangles.com',
  'http://localhost:8888',
  'http://127.0.0.1:8888'
];

const CAMPS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.regularOpeningHours.openNow'
].join(',');

function httpsPost(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Temps d\'espera esgotat')));
    req.write(postData);
    req.end();
  });
}

function capcaleresCors(origin) {
  const permes = ORIGENS_PERMESOS.includes(origin) ? origin : ORIGENS_PERMESOS[0];
  return {
    'Access-Control-Allow-Origin': permes,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

exports.handler = async (event) => {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const cors = capcaleresCors(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const json = (statusCode, obj, extra = {}) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
    body: JSON.stringify(obj)
  });

  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) return json(500, { error: 'GOOGLE_PLACES_KEY no configurada a Netlify' });

  const q = ((event.queryStringParameters && event.queryStringParameters.q) || '').trim();
  if (q.length < 3 || q.length > 200) return json(400, { error: 'Cal el paràmetre q (entre 3 i 200 caràcters)' });

  const lang = ['ca', 'es', 'en'].includes(event.queryStringParameters.lang) ? event.queryStringParameters.lang : 'ca';

  const postData = JSON.stringify({
    textQuery: q,
    languageCode: lang,
    regionCode: 'ES',
    maxResultCount: 1,
    // Prioritza resultats a Catalunya
    locationBias: { rectangle: { low: { latitude: 40.52, longitude: 0.15 }, high: { latitude: 42.87, longitude: 3.33 } } }
  });

  try {
    const result = await httpsPost({
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': CAMPS
      }
    }, postData);

    if (result.status !== 200) {
      return json(502, { error: 'Google Places ha retornat ' + result.status, detail: result.body.slice(0, 400) });
    }

    const data = JSON.parse(result.body);
    const p = (data.places && data.places[0]) || null;

    // Guardem la resposta 7 dies a la CDN (també quan no troba res)
    const cache = {
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, durable'
    };

    if (!p) return json(200, { found: false }, cache);

    return json(200, {
      found: true,
      placeId: p.id,
      name: p.displayName ? p.displayName.text : '',
      address: p.formattedAddress || '',
      phone: p.nationalPhoneNumber || '',
      phoneIntl: p.internationalPhoneNumber || '',
      website: p.websiteUri || '',
      mapsUrl: p.googleMapsUri || '',
      rating: p.rating || null,
      ratingCount: p.userRatingCount || 0,
      status: p.businessStatus || '',
      openNow: p.regularOpeningHours ? p.regularOpeningHours.openNow : null,
      hours: (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions) || []
    }, cache);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
