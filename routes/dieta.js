const express = require('express');
const router = express.Router();
const { verificarTokenOpcional } = require('../middleware/auth');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const NUTRICION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nombre: { type: 'STRING' },
    porcion: { type: 'STRING' },
    calorias: { type: 'NUMBER' },
    proteinas_g: { type: 'NUMBER' },
    carbohidratos_g: { type: 'NUMBER' },
    grasas_g: { type: 'NUMBER' },
  },
  required: ['nombre', 'porcion', 'calorias', 'proteinas_g', 'carbohidratos_g', 'grasas_g'],
};

// Chequeo híbrido: si tiene req.uid (pasó el token opcional) está autorizado por Firebase.
// Si no tiene req.uid, exigimos el secreto de la app (modo invitado).
function verificarAccesoHibrido(req, res, next) {
  if (req.uid) {
    return next();
  }

  const secreto = req.headers['x-app-secret'];
  if (!process.env.DIETA_APP_SECRET) {
    console.error('Falta DIETA_APP_SECRET en el entorno del servidor');
    return res.status(500).json({ error: 'servidor mal configurado' });
  }
  if (secreto !== process.env.DIETA_APP_SECRET) {
    return res.status(401).json({ error: 'no autorizado (requiere login o secreto valido)' });
  }
  next();
}

// POST /api/dieta/estimar  { descripcion }
// Hace de proxy hacia Gemini: la GEMINI_API_KEY vive solo en el servidor.
router.post('/estimar', verificarTokenOpcional, verificarAccesoHibrido, async (req, res) => {
  try {
    const { descripcion } = req.body;
    if (typeof descripcion !== 'string' || !descripcion.trim()) {
      return res.status(400).json({ error: 'descripcion invalida' });
    }
    if (!process.env.GEMINI_API_KEY) {
      console.error('Falta GEMINI_API_KEY en el entorno del servidor');
      return res.status(500).json({ error: 'servidor mal configurado' });
    }

    const prompt = `Sos un asistente nutricional. Estimá la información nutricional del siguiente alimento o comida, asumiendo una porción razonable y habitual si el usuario no la especifica. Si describe varios alimentos juntos, sumá todo en un solo resultado combinado.

Alimento: "${descripcion.trim()}"

Devolvé valores numéricos estimados (no hace falta precisión exacta, una buena estimación alcanza).`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: NUTRICION_SCHEMA,
        },
      }),
    });

    if (!geminiRes.ok) {
      const detalle = await geminiRes.text();
      console.error('Error Gemini:', geminiRes.status, detalle);
      if (geminiRes.status === 429) {
        return res.status(429).json({ error: 'limite_gratuito_alcanzado' });
      }
      return res.status(502).json({ error: 'error_gemini' });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: 'gemini_sin_resultado' });
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    console.error('Error POST /api/dieta/estimar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;