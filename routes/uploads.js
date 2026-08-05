const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { verificarAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const CARPETA = path.join(__dirname, '..', 'uploads', 'productos');

// Nos aseguramos de que la carpeta exista
fs.mkdirSync(CARPETA, { recursive: true });

const EXTENSIONES_OK = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Ancho maximo al que redimensionamos las imagenes de producto
const ANCHO_MAXIMO = 1400;

// Guardamos en memoria para poder procesar antes de escribir a disco
const upload = multer({
  storage: multer.memoryStorage(),
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

// POST /api/uploads/producto - sube y comprime una imagen de producto
router.post('/producto', verificarAdmin, (req, res) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) {
      console.error('Error al subir imagen:', err.message);
      const mensaje =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen supera los 5 MB'
          : err.message;
      return res.status(400).json({ error: mensaje });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    try {
      const nombreArchivo = `${uuidv4()}.webp`;
      const destino = path.join(CARPETA, nombreArchivo);

      const imagen = sharp(req.file.buffer, { animated: true });
      const metadata = await imagen.metadata();

      // Solo achicamos si la imagen es mas ancha que el maximo
      if (metadata.width && metadata.width > ANCHO_MAXIMO) {
        imagen.resize({ width: ANCHO_MAXIMO, withoutEnlargement: true });
      }

      await imagen.webp({ quality: 82 }).toFile(destino);

      const { size } = fs.statSync(destino);
      console.log(
        `Imagen subida: ${nombreArchivo} (${Math.round(req.file.size / 1024)} KB -> ${Math.round(size / 1024)} KB)`
      );

      res.status(201).json({
        url: `/uploads/productos/${nombreArchivo}`,
        nombre: nombreArchivo,
      });
    } catch (error) {
      console.error('Error al procesar la imagen:', error.message);
      res.status(500).json({ error: 'No se pudo procesar la imagen' });
    }
  });
});

module.exports = router;