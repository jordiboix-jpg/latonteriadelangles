// Netlify Function — translate.js
// Tradueix text català → castellà + anglès via Anthropic API
// La ANTHROPIC_API_KEY va a Netlify > Site configuration > Environment variables

const https = require('https');

function httpsPost(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

exports.handler = async (event) => {
  // Només POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invàlid' }) };
  }

  const { ca, eng } = body;
  if (!ca) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cal el camp "ca"' }) };
  }

  // Construïm el prompt
  const prompt = `Ets el corrector i traductor del web satíric "La Tonteria de l'Anglès", que cataloga establiments catalans amb rètols en anglès innecessari.

Tens aquestes dades d'una entrada del diccionari de l'absurd:
- Terme en anglès (com apareix al rètol): ${eng || '(no especificat)'}
- Traducció/equivalent en català: ${ca}

Proporciona:
1. La traducció al castellà del terme català (camp "es") — equivalent natural en castellà, no traducció literal
2. Un comentari humorístic en castellà (camp "comment_es") — to irònic i lleuger, màx 120 caràcters. Si el comentari català és buit, crea'n un de nou en castellà.
3. Un comentari humorístic en anglès (camp "comment_en") — mateix to, màx 120 caràcters en anglès.

Respon ÚNICAMENT amb JSON vàlid, sense cap text addicional:
{"es":"...","comment_es":"...","comment_en":"..."}`;

  const postData = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const result = await httpsPost({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, postData);

    if (result.status !== 200) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'API Anthropic ha retornat ' + result.status,
          detail: result.body.slice(0, 400),
          keyPrefix: apiKey.slice(0, 12) + '…'
        })
      };
    }

    const data = JSON.parse(result.body);
    const text = data.content?.[0]?.text || '';

    // Extreu el JSON de la resposta
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Resposta inesperada', raw: text }) };
    }

    const parsed = JSON.parse(match[0]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
