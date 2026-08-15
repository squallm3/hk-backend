const express = require('express');
const crypto = require('crypto');
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const requestsByIp = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const XP_POR_TIRADA = 777;

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
    console.error(
      'Error POST /api/iching/interpretar:',
      error.message
    );

    res.status(500).json({
      error: 'Error interno al consultar Gemini.'
    });
  }
});


router.post('/tiradas', verificarToken, async (req, res) => {
  const {
    question,
    hexagram,
    lines,
    relatingHexagram
  } = req.body;

  if (
    !question ||
    !hexagram ||
    !hexagram.number ||
    !hexagram.name ||
    !hexagram.judgement ||
    !Array.isArray(lines)
  ) {
    return res.status(400).json({
      error: 'Faltan datos obligatorios de la tirada.'
    });
  }

  if (String(question).trim().length > 500) {
    return res.status(400).json({
      error: 'La pregunta no puede superar los 500 caracteres.'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const uuid = crypto.randomUUID();

    // 1. Guardar la tirada
    const [result] = await connection.query(
      `INSERT INTO iching_tiradas
        (uuid, usuarioId, pregunta, hexagramaNumero, hexagramaNombre,
         dictamen, lineas, hexagramaResultanteNumero, hexagramaResultanteNombre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        req.uid,
        String(question).trim(),
        Number(hexagram.number),
        String(hexagram.name).trim(),
        String(hexagram.judgement).trim(),
        JSON.stringify(lines),
        relatingHexagram?.number
          ? Number(relatingHexagram.number)
          : null,
        relatingHexagram?.name
          ? String(relatingHexagram.name).trim()
          : null
      ]
    );

    // 2. Sumar 777 XP de forma atómica
    const [xpResult] = await connection.query(
      `UPDATE personajes
       SET xpAcumulada = GREATEST(0, xpAcumulada + ?)
       WHERE usuarioId = ?
         AND activo = 1`,
      [XP_POR_TIRADA, req.uid]
    );

    if (xpResult.affectedRows === 0) {
      throw new Error(
        `No se encontró personaje activo para el usuario ${req.uid}`
      );
    }

    // 3. Recalcular nivel según XP acumulada
    const [personajeRows] = await connection.query(
      `SELECT xpAcumulada
       FROM personajes
       WHERE usuarioId = ?
         AND activo = 1
       LIMIT 1`,
      [req.uid]
    );

    if (!personajeRows.length) {
      throw new Error('No se pudo recuperar el personaje.');
    }

    const xpAcumulada = personajeRows[0].xpAcumulada;

    const [nivelRows] = await connection.query(
      `SELECT id
       FROM niveles
       WHERE xpAcumulada <= ?
       ORDER BY xpAcumulada DESC
       LIMIT 1`,
      [xpAcumulada]
    );

    const nivelId = nivelRows.length
      ? nivelRows[0].id
      : 1;

    await connection.query(
      `UPDATE personajes
       SET nivelId = ?
       WHERE usuarioId = ?
         AND activo = 1`,
      [nivelId, req.uid]
    );

    await connection.commit();

    console.log(
      '[POST tiradas] uid:',
      req.uid,
      '| tiradaId:',
      result.insertId,
      '| XP:',
      `+${XP_POR_TIRADA}`,
      '| xpAcumulada:',
      xpAcumulada,
      '| nivelId:',
      nivelId
    );

    res.status(201).json({
      id: result.insertId,
      uuid,
      xpGanada: XP_POR_TIRADA,
      xpAcumulada,
      nivelId
    });

  } catch (error) {
    await connection.rollback();

    console.error(
      'Error POST /api/iching/tiradas:',
      error.message
    );

    res.status(500).json({
      error: 'No se pudo guardar la tirada ni otorgar la experiencia.'
    });
  } finally {
    connection.release();
  }
});


router.get('/tiradas', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, uuid, pregunta, hexagramaNumero, hexagramaNombre,
              dictamen, lineas, hexagramaResultanteNumero,
              hexagramaResultanteNombre, interpretacionIA, createdAt, updatedAt
       FROM iching_tiradas
       WHERE usuarioId = ?
       ORDER BY createdAt DESC`,
      [req.uid]
    );

    res.json(rows);
  } catch (error) {
    console.error(
      'Error GET /api/iching/tiradas:',
      error.message
    );

    res.status(500).json({
      error: 'No se pudo obtener el historial.'
    });
  }
});


router.patch(
  '/tiradas/:id/interpretacion',
  verificarToken,
  async (req, res) => {
    const { interpretation } = req.body;

    if (
      !interpretation ||
      String(interpretation).trim().length > 12000
    ) {
      return res.status(400).json({
        error: 'La interpretación no es válida.'
      });
    }

    try {
      const [result] = await pool.query(
        `UPDATE iching_tiradas
         SET interpretacionIA = ?
         WHERE id = ? AND usuarioId = ?`,
        [
          String(interpretation).trim(),
          req.params.id,
          req.uid
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: 'Tirada no encontrada.'
        });
      }

      res.json({ ok: true });

    } catch (error) {
      console.error(
        'Error PATCH /api/iching/tiradas/:id/interpretacion:',
        error.message
      );

      res.status(500).json({
        error: 'No se pudo guardar la interpretación.'
      });
    }
  }
);


module.exports = router;