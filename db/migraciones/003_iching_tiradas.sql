-- ============================================================
-- HK-ICHING Beta 2
-- Historial de tiradas autenticadas
-- ============================================================

CREATE TABLE IF NOT EXISTS `iching_tiradas` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuarioId` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pregunta` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hexagramaNumero` int NOT NULL,
  `hexagramaNombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dictamen` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `lineas` json NOT NULL,
  `hexagramaResultanteNumero` int DEFAULT NULL,
  `hexagramaResultanteNombre` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `interpretacionIA` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `usuario_fecha` (`usuarioId`,`createdAt`),
  CONSTRAINT `iching_tiradas_usuario_fk`
    FOREIGN KEY (`usuarioId`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
