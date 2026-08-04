-- ============================================================
--  Modulo SPLIT — gastos compartidos entre parejas y amigos
--  Base: haiku_gnostico
-- ============================================================
--  Este script es PURAMENTE ADITIVO.
--  No modifica, no borra y no altera ninguna tabla existente.
--  La tabla `usuarios` solo se referencia por foreign key.
--
--  Convenciones copiadas del esquema actual:
--    - InnoDB, utf8mb4 / utf8mb4_unicode_ci
--    - id int AUTO_INCREMENT interno + uuid char(36) publico
--    - usuarioId varchar(128)  (UID de Firebase)
--    - createdAt / updatedAt / deletedAt datetime
--    - montos en decimal(12,2)
--
--  Como aplicarlo:
--    docker exec -i mysql-tienda mysql -u haikus -p haiku_gnostico < db/split-schema.sql
--
--  Para revertir todo, ver el bloque comentado al final del archivo.
-- ============================================================

-- ------------------------------------------------------------
-- Grupos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `split_grupos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emoji` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `moneda` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ARS',
  `creadorId` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `creadorId` (`creadorId`),
  CONSTRAINT `split_grupos_ibfk_1` FOREIGN KEY (`creadorId`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Miembros de un grupo
--   usuarioId es NULL cuando la persona todavia no tiene cuenta.
--   En ese caso solo se guarda el nombre, y mas adelante se
--   puede vincular sin perder el historial de gastos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `split_grupo_miembros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grupoId` int NOT NULL,
  `usuarioId` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rol` enum('admin','miembro') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'miembro',
  `activo` tinyint(1) DEFAULT '1',
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  UNIQUE KEY `grupo_usuario` (`grupoId`,`usuarioId`),
  KEY `usuarioId` (`usuarioId`),
  CONSTRAINT `split_miembros_ibfk_1` FOREIGN KEY (`grupoId`) REFERENCES `split_grupos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `split_miembros_ibfk_2` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Gastos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `split_gastos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grupoId` int NOT NULL,
  `descripcion` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'otros',
  `monto` decimal(12,2) NOT NULL,
  `pagadoPorId` int NOT NULL,
  `tipoReparto` enum('igual','monto','porcentaje','partes') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'igual',
  `fecha` date NOT NULL,
  `creadoPorId` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `grupo_fecha` (`grupoId`,`fecha`),
  KEY `pagadoPorId` (`pagadoPorId`),
  KEY `creadoPorId` (`creadoPorId`),
  CONSTRAINT `split_gastos_ibfk_1` FOREIGN KEY (`grupoId`) REFERENCES `split_grupos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `split_gastos_ibfk_2` FOREIGN KEY (`pagadoPorId`) REFERENCES `split_grupo_miembros` (`id`),
  CONSTRAINT `split_gastos_ibfk_3` FOREIGN KEY (`creadoPorId`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Partes de cada gasto (cuanto le toca a cada miembro)
--   La suma de las partes SIEMPRE debe ser igual al monto del
--   gasto. Eso se valida en la API dentro de una transaccion.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `split_gasto_partes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `gastoId` int NOT NULL,
  `miembroId` int NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gasto_miembro` (`gastoId`,`miembroId`),
  KEY `miembroId` (`miembroId`),
  CONSTRAINT `split_partes_ibfk_1` FOREIGN KEY (`gastoId`) REFERENCES `split_gastos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `split_partes_ibfk_2` FOREIGN KEY (`miembroId`) REFERENCES `split_grupo_miembros` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Pagos entre miembros (para saldar deudas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `split_pagos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grupoId` int NOT NULL,
  `deMiembroId` int NOT NULL,
  `aMiembroId` int NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `fecha` date NOT NULL,
  `notas` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creadoPorId` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `grupo_fecha` (`grupoId`,`fecha`),
  KEY `deMiembroId` (`deMiembroId`),
  KEY `aMiembroId` (`aMiembroId`),
  CONSTRAINT `split_pagos_ibfk_1` FOREIGN KEY (`grupoId`) REFERENCES `split_grupos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `split_pagos_ibfk_2` FOREIGN KEY (`deMiembroId`) REFERENCES `split_grupo_miembros` (`id`),
  CONSTRAINT `split_pagos_ibfk_3` FOREIGN KEY (`aMiembroId`) REFERENCES `split_grupo_miembros` (`id`),
  CONSTRAINT `split_pagos_ibfk_4` FOREIGN KEY (`creadoPorId`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  ROLLBACK — para deshacer todo este modulo sin tocar nada mas.
--  Descomentar y ejecutar solo si queres eliminarlo por completo.
--  El orden importa por las foreign keys.
-- ============================================================
-- DROP TABLE IF EXISTS `split_pagos`;
-- DROP TABLE IF EXISTS `split_gasto_partes`;
-- DROP TABLE IF EXISTS `split_gastos`;
-- DROP TABLE IF EXISTS `split_grupo_miembros`;
-- DROP TABLE IF EXISTS `split_grupos`;
