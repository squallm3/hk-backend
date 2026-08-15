const express = require('express');

const router = express.Router();

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const requestsByIp = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

function allowed(ip) {
  const now = Date.now();
  const previous = requestsByIp.get(ip) || [];
  const recent = previous.filter(timestamp => now - timestamp < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestsByIp.set(ip, recent);
    return false;
  }

  recent.push(now);
  requestsByIp.set(ip, recent);
  return true;
}

function buildPrompt({ question, hexagram, judgement, lines, relatingHexagram }) {
  const linesText = Array.isArray(lines)
    ? lines.map((line, index) => {
        if (typeof line === 'object') {
          return `Línea ${line.position || index + 1}: valor ${line.sum ?? 'N/D'} — ${line.label || ''}`;
        }
        return `Línea ${index + 1}: ${line}`;
      }).join('\n')
    : String(lines || 'No informado');

  return `Actuá como un intérprete del I Ching.

Voy a darte una pregunta realizada al oráculo y el resultado de una tirada. Interpretá el resultado específicamente en relación con la pregunta. No te limites a explicar el significado general del hexagrama.

Criterios:
- Comprendé primero cuál es el núcleo de la pregunta.
- Relacioná directamente el hexagrama con la situación planteada.
- Explicá qué aspecto de la situación señala el dictamen.
- Indicá qué actitud, acción o disposición recomienda.
- Señalá obstáculos, riesgos, oportunidades o condiciones relevantes.
- Si existen líneas mutantes, incorporalas a la interpretación.
- Si existe un hexagrama resultante, explicá cómo puede representar la evolución o dirección del proceso.
- No presentes el I Ching como una predicción absoluta ni como un futuro determinado.
- No inventes información que no esté presente en la consulta o en la tirada.
- Usá el I Ching como herramienta simbólica y reflexiva.
- Terminá con una síntesis clara y concreta aplicada directamente a la pregunta.

PREGUNTA:
${question}

HEXAGRAMA:
${hexagram}

DICTAMEN:
${judgement}

LÍNEAS:
${linesText}

HEXAGRAMA RESULTANTE:
${relatingHexagram || 'No hay hexagrama resultante informado.'}

Ahora realizá la interpretación contextualizada.`;
}

router.post('/interpretar', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY no está configurada en el backend.'
    });
  }

  if (!allowed(req.ip)) {
    return res.status(429).json({
      error: 'Demasiadas consultas. Esperá un minuto antes de volver a intentar.'
    });
  }

  const { question, hexagram, judgement, lines, relatingHexagram } = req.body;

  if (!question || !hexagram || !judgement) {
    return res.status(400).json({
      error: 'Faltan question, hexagram o judgement.'
    });
  }

  try {
    const prompt = buildPrompt({
      question: String(question).trim(),
      hexagram: String(hexagram).trim(),
      judgement: String(judgement).trim(),
      lines,
      relatingHexagram: relatingHexagram ? String(relatingHexagram).trim() : ''
    });

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error Gemini:', JSON.stringify(data));
      return res.status(502).json({
        error: 'Gemini no pudo procesar la interpretación.',
        detalle: data?.error?.message || 'Error desconocido de Gemini.'
      });
    }

    const interpretation =
      data?.candidates?.[0]?.content?.parts
        ?.filter(part => typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
        .trim();

    if (!interpretation) {
      return res.status(502).json({
        error: 'Gemini respondió sin contenido interpretable.'
      });
    }

    res.json({
      model: GEMINI_MODEL,
      interpretation
    });
  } catch (error) {
    console.error('Error POST /api/iching/interpretar:', error.message);
    res.status(500).json({
      error: 'Error interno al consultar Gemini.'
    });
  }
});

module.exports = router;
