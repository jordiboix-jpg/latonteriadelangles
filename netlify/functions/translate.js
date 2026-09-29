// Netlify Function — translate.js
// Tradueix text català → castellà + anglès via Anthropic API
// La ANTHROPIC_API_KEY va a Netlify > Site configuration > Environment variables

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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      let errBody = '';
      try { errBody = await response.text(); } catch(_) {}
      // Diagnòstic: mostra status + primers 400 chars de la resposta
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'API Anthropic ha retornat ' + response.status,
          detail: errBody.slice(0, 400),
          keyPrefix: apiKey ? apiKey.slice(0,12) + '…' : 'absent'
        })
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extreu el JSON de la resposta
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Resposta inesperada', raw: text }) };
    }

    const result = JSON.parse(match[0]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
