-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  role VARCHAR(50) DEFAULT 'customer',
  avatar TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  old_price DECIMAL(10, 2),
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  sizes JSONB DEFAULT '[]'::jsonb,
  colors JSONB DEFAULT '[]'::jsonb,
  stock INTEGER DEFAULT 0,
  sku VARCHAR(100) UNIQUE NOT NULL,
  badge VARCHAR(50),
  rating DECIMAL(2, 1) DEFAULT 4.5,
  reviews INTEGER DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  specifications JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  shipping_address JSONB,
  payment_method VARCHAR(50),
  payment_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items del pedido
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

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(100) UNIQUE NOT NULL,
  customer_first_name VARCHAR(255) NOT NULL,
  customer_last_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  shipping_address TEXT NOT NULL,
  shipping_city VARCHAR(255) NOT NULL,
  shipping_state VARCHAR(255),
  shipping_zip_code VARCHAR(50),
  shipping_country VARCHAR(100) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_card_last4 VARCHAR(4),
  subtotal DECIMAL(10, 2) NOT NULL,
  shipping_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'completed',
  order_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items de ventas
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales(order_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);