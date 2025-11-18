-- backend/database/schema.sql

-- Crear base de datos (ejecutar primero en psql)
-- CREATE DATABASE stylehub_db;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  role VARCHAR(50) DEFAULT 'customer', -- 'customer', 'admin'
  avatar TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'hombre', 'mujer', 'ninos', 'ofertas', 'novedades'
  price DECIMAL(10, 2) NOT NULL,
  old_price DECIMAL(10, 2),
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb, -- Array de URLs de imágenes
  sizes JSONB DEFAULT '[]'::jsonb, -- ['S', 'M', 'L', 'XL']
  colors JSONB DEFAULT '[]'::jsonb, -- ['Negro', 'Blanco', 'Azul']
  stock INTEGER DEFAULT 0,
  sku VARCHAR(100) UNIQUE NOT NULL,
  badge VARCHAR(50), -- 'HOT', 'NEW', null
  rating DECIMAL(2, 1) DEFAULT 4.5,
  reviews INTEGER DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb, -- Características del producto
  specifications JSONB DEFAULT '{}'::jsonb, -- Especificaciones técnicas
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
  shipping_address JSONB,
  payment_method VARCHAR(50),
  payment_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de ítems del pedido
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(255),
  product_image TEXT,
  quantity INTEGER NOT NULL,
  size VARCHAR(50),
  color VARCHAR(50),
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar usuario admin por defecto
INSERT INTO users (name, email, password, role, avatar) VALUES
('Admin', 'admin@carlos.com', 'Admin123', 'admin', 'https://ui-avatars.com/api/?name=Admin&background=8B5CF6&color=fff'),
('Demo User', 'admin@demo.com', '123456', 'customer', 'https://ui-avatars.com/api/?name=Demo+User&background=EC4899&color=fff')
ON CONFLICT (email) DO NOTHING;

-- Insertar algunos productos de ejemplo (opcional)
INSERT INTO products (name, category, price, old_price, description, images, sizes, colors, stock, sku, badge, features, specifications) VALUES
(
  'Hoodie Personalizada Premium',
  'hombre',
  189.99,
  249.99,
  'Hoodie de algodón franela de alta calidad con diseño personalizable. Perfecta para el clima de La Paz.',
  '["https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&h=1000&fit=crop"]'::jsonb,
  '["S", "M", "L", "XL", "XXL"]'::jsonb,
  '["Negro", "Gris", "Azul Marino", "Rojo"]'::jsonb,
  45,
  'HOOD-PREM-001',
  'HOT',
  '["Algodón 100% peruano", "Hilo de alta resistencia", "Diseño personalizable", "Bolsillo canguro", "Capucha ajustable"]'::jsonb,
  '{"Material": "Algodón franela", "Peso": "450g", "Origen": "Bolivia", "Cuidado": "Lavar a mano"}'::jsonb
)
ON CONFLICT (sku) DO NOTHING;

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Actualizar productos existentes para tener URLs completas
-- Ejecutar en psql o tu cliente PostgreSQL


-- Tabla principal de ventas
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(100) UNIQUE NOT NULL,
  
  -- Información del cliente
  customer_first_name VARCHAR(255) NOT NULL,
  customer_last_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  
  -- Información de envío
  shipping_address TEXT NOT NULL,
  shipping_city VARCHAR(255) NOT NULL,
  shipping_state VARCHAR(255),
  shipping_zip_code VARCHAR(50),
  shipping_country VARCHAR(100) NOT NULL,
  
  -- Información de pago
  payment_method VARCHAR(50) NOT NULL,
  payment_card_last4 VARCHAR(4),
  
  -- Totales
  subtotal DECIMAL(10, 2) NOT NULL,
  shipping_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  
  -- Estado y fechas
  status VARCHAR(50) DEFAULT 'completed',
  order_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items de cada venta
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  size VARCHAR(50) NOT NULL,
  color VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON sales(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer_email ON sales(customer_email);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales(order_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- Verificar que las tablas se crearon correctamente
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('sales', 'sale_items');

UPDATE products 
SET images = jsonb_set(
  images,
  '{0}',
  to_jsonb('http://localhost:5000' || (images->0)::text)
)
WHERE images->0 LIKE '"/uploads/%';