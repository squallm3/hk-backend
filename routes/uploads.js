const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verificarAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const CARPETA = path.join(__dirname, '..', 'uploads', 'productos');

// Nos aseguramos de que la carpeta exista
fs.mkdirSync(CARPETA, { recursive: true });

const EXTENSIONES_OK = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONES_OK.includes(extension)) {
      return cb(new Error('Formato de imagen no permitido'));
    }
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('El archivo no es una imagen'));
    }
    cb(null, true);
  },
});

// POST /api/uploads/producto - sube una imagen de producto
router.post('/producto', verificarAdmin, (req, res) => {
  upload.single('imagen')(req, res, (err) => {
    if (err) {
      console.error('Error al subir imagen:', err.message);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    // Ruta publica servida por el backend
    res.status(201).json({
      url: `/uploads/productos/${req.file.filename}`,
      nombre: req.file.filename,
    });
  });
});

module.exports = router;