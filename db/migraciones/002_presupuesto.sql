-- Migración 002: tablas del módulo de presupuesto (hk-budget-web)

CREATE TABLE IF NOT EXISTS cuentas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  usuarioId VARCHAR(128) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  tipo ENUM('checking', 'savings', 'credit', 'cash') NOT NULL DEFAULT 'checking',
  saldoInicial DECIMAL(12,2) NOT NULL DEFAULT 0,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  deletedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cuentas_usuario (usuarioId)
);

CREATE TABLE IF NOT EXISTS categorias_gasto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  usuarioId VARCHAR(128) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  deletedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_categorias_gasto_usuario (usuarioId)
);

CREATE TABLE IF NOT EXISTS transacciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  usuarioId VARCHAR(128) NOT NULL,
  cuentaId INT NOT NULL,
  categoriaId INT NULL,
  fecha DATE NOT NULL,
  descripcion VARCHAR(255) NULL,
  monto DECIMAL(12,2) NOT NULL,
  nota VARCHAR(255) NULL,
  deletedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transacciones_usuario (usuarioId),
  INDEX idx_transacciones_cuenta (cuentaId),
  INDEX idx_transacciones_categoria (categoriaId),
  CONSTRAINT fk_transacciones_cuenta FOREIGN KEY (cuentaId) REFERENCES cuentas(id) ON DELETE CASCADE,
  CONSTRAINT fk_transacciones_categoria FOREIGN KEY (categoriaId) REFERENCES categorias_gasto(id) ON DELETE SET NULL
);
