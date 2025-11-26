// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const bcrypt = require('bcryptjs');

// ⬇️ AGREGAR ESTA LÍNEA
const initDatabase = require('./database/init-db');
const app = express();

// CONFIGURACIÓN DE POSTGRESQL
// ================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🔗 Conectando a base de datos...');
console.log('Entorno:', process.env.NODE_ENV || 'development');

// ================================
// FUNCIONES DE ADMIN - VERSIÓN CORREGIDA
// ================================
async function createAdmin(name, email, password) {
  try {
    // Verificar si el usuario ya existe
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`⚠️ Usuario ya existe: ${email}`);
      return;
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insertar nuevo usuario
    await pool.query(
      `INSERT INTO users (name, email, password, role, avatar, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        name,
        email,
        hashedPassword,
        'admin', // Rol de administrador
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=000000&color=fff`
      ]
    );
    console.log(`✅ Usuario admin creado: ${email}`);
  } catch (error) {
    console.error(`❌ Error creando admin ${email}:`, error.message);
  }
}

async function setupAdmins() {
  console.log('👥 Creando usuarios administradores...');
  
  // Crear los usuarios específicos que necesitas
  await createAdmin('Carlos', 'carlos@loyola.com', 'Carlos123');
  await createAdmin('Darwin', 'darwin@loyola.com', 'Darwin123');
  await createAdmin('Jesus', 'jesus@loyola.com', 'Jesus123');
  await createAdmin('Mel', 'mel@loyola.com', 'Mel123');
  await createAdmin('Admin Principal', 'admin@loyola.com', 'Admin123');
  
  console.log('✅ Todos los usuarios admin han sido creados/verificados');
}

// Ejecutar setup al iniciar el backend
//setupAdmins();

// ================================
// MIDDLEWARES
// ================================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  req.imageBaseUrl = `${req.protocol}://${req.get('host')}`;
  next();
});

// ================================
// CLOUDINARY CONFIGURACIÓN
// ================================
const { upload } = require('./config/cloudinary');

// ================================
// RUTAS DE AUTENTICACIÓN
// ================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });

    const token = 'token_' + Date.now();
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, message: 'El email ya está registrado' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, phone, role, avatar)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, email, hashedPassword, phone || null, 'customer', `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`]
    );

    const newUser = result.rows[0];
    const token = 'token_' + Date.now();

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        avatar: newUser.avatar
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ success: false, message: 'Error al registrar usuario' });
  }
});

// Actualizar perfil
app.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, name, email, phone, address } = req.body;
    const result = await pool.query(
      `UPDATE users SET name = $1, email = $2, phone = $3, address = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
      [name, email, phone, address, id]
    );

    const updatedUser = result.rows[0];
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar perfil' });
  }
});

// ============================================
// RUTAS DE PRODUCTOS
// ============================================

// Obtener todos los productos
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, inStock } = req.query;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (category && category !== 'all') {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (minPrice) {
      query += ` AND price >= $${paramCount}`;
      params.push(parseFloat(minPrice));
      paramCount++;
    }

    if (maxPrice) {
      query += ` AND price <= $${paramCount}`;
      params.push(parseFloat(maxPrice));
      paramCount++;
    }

    if (inStock === 'true') {
      query += ' AND stock > 0';
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      products: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener productos' 
    });
  }
});

// Obtener un producto por ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }

    res.json({
      success: true,
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener producto' 
    });
  }
});

// Crear producto con Cloudinary
app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    const {
      name, category, price, oldPrice, description,
      sizes, colors, stock, sku, badge, features, specifications
    } = req.body;

    // Las URLs de Cloudinary vienen directamente en req.files
    const images = req.files.map(file => file.path);

    const result = await pool.query(
      `INSERT INTO products (
        name, category, price, old_price, description, 
        images, sizes, colors, stock, sku, badge, 
        rating, reviews, features, specifications
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING *`,
      [
        name,
        category,
        parseFloat(price),
        oldPrice ? parseFloat(oldPrice) : null,
        description,
        JSON.stringify(images),  // ← URLs completas aquí
        JSON.stringify(JSON.parse(sizes)),
        JSON.stringify(JSON.parse(colors)),
        parseInt(stock),
        sku,
        badge || null,
        4.5,
        0,
        JSON.stringify(JSON.parse(features || '[]')),
        JSON.stringify(JSON.parse(specifications || '{}'))
      ]
    );

    res.json({
      success: true,
      message: 'Producto creado exitosamente',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al crear producto' 
    });
  }
});

// Actualizar producto
app.put('/api/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, category, price, oldPrice, description,
      sizes, colors, stock, sku, badge, features,
      specifications, existingImages
    } = req.body;

// Combinar imágenes existentes con las nuevas (Cloudinary)
let images = existingImages ? JSON.parse(existingImages) : [];
if (req.files && req.files.length > 0) {
  const newImages = req.files.map(file => file.path);
  images = [...images, ...newImages];
}
```

---

### **PASO 5: Agregar variables de entorno en Render**

1. Ve a [dashboard.render.com](https://dashboard.render.com)
2. Click en tu Web Service **"stylehub-backend"**
3. Ve a **"Environment"** en el menú izquierdo
4. Click en **"Add Environment Variable"**

Agrega estas **3 variables** (una por una):
```
Key: CLOUDINARY_CLOUD_NAME
Value: [do8pf3wh9]

Key: CLOUDINARY_API_KEY
Value: [126979415847751]

Key: CLOUDINARY_API_SECRET
Value: [jAwjcnrdngMSD3oKEnqN5t1zAGc]

    const result = await pool.query(
      `UPDATE products SET
        name = $1,
        category = $2,
        price = $3,
        old_price = $4,
        description = $5,
        images = $6,
        sizes = $7,
        colors = $8,
        stock = $9,
        sku = $10,
        badge = $11,
        features = $12,
        specifications = $13,
        updated_at = NOW()
      WHERE id = $14
      RETURNING *`,
      [
        name,
        category,
        parseFloat(price),
        oldPrice ? parseFloat(oldPrice) : null,
        description,
        JSON.stringify(images),
        JSON.stringify(JSON.parse(sizes)),
        JSON.stringify(JSON.parse(colors)),
        parseInt(stock),
        sku,
        badge || null,
        JSON.stringify(JSON.parse(features || '[]')),
        JSON.stringify(JSON.parse(specifications || '{}')),
        id
      ]
    );

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al actualizar producto' 
    });
  }
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query('DELETE FROM products WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Producto eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al eliminar producto' 
    });
  }
});

// ============================================
// RUTAS DE PRONÓSTICO
// ============================================
const forecastRoutes = require('./routes/forecast');
app.use('/api/forecast', forecastRoutes);
console.log('✅ Rutas de pronóstico configuradas');



// ============================================
// ESTADÍSTICAS DEL DASHBOARD
// ============================================

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const productsCount = await pool.query('SELECT COUNT(*) FROM products');
    const lowStockCount = await pool.query('SELECT COUNT(*) FROM products WHERE stock < 20');
    const totalValue = await pool.query('SELECT SUM(price * stock) as total FROM products');
    
    res.json({
      success: true,
      stats: {
        totalProducts: parseInt(productsCount.rows[0].count),
        lowStock: parseInt(lowStockCount.rows[0].count),
        totalValue: parseFloat(totalValue.rows[0].total || 0)
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener estadísticas' 
    });
  }
});

// ============================================
// RUTAS DE VENTAS
// ============================================

// Crear nueva venta y actualizar stock
app.post('/api/sales', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { customer, shipping, payment, items, totals, orderDate } = req.body;
    
    // 1. Validar que hay suficiente stock para todos los productos
    const stockErrors = [];
    
    for (const item of items) {
      const result = await client.query(
        'SELECT stock, name FROM products WHERE id = $1',
        [item.productId]
      );
      
      if (result.rows.length === 0) {
        stockErrors.push({
          product: item.productName,
          requested: item.quantity,
          available: 0,
          error: 'Producto no encontrado'
        });
      } else if (result.rows[0].stock < item.quantity) {
        stockErrors.push({
          product: result.rows[0].name,
          requested: item.quantity,
          available: result.rows[0].stock
        });
      }
    }
    
    if (stockErrors.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Stock insuficiente para algunos productos',
        errors: stockErrors
      });
    }
    
    // 2. Generar número de orden único
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // 3. Insertar la venta principal
    const saleResult = await client.query(
      `INSERT INTO sales (
        order_number, 
        customer_first_name, 
        customer_last_name, 
        customer_email, 
        customer_phone,
        shipping_address,
        shipping_city,
        shipping_state,
        shipping_zip_code,
        shipping_country,
        payment_method,
        payment_card_last4,
        subtotal,
        shipping_cost,
        tax,
        total,
        status,
        order_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
      RETURNING *`,
      [
        orderNumber,
        customer.firstName,
        customer.lastName,
        customer.email,
        customer.phone,
        shipping.address,
        shipping.city,
        shipping.state || '',
        shipping.zipCode || '',
        shipping.country,
        payment.method,
        payment.cardLast4,
        totals.subtotal,
        totals.shipping,
        totals.tax,
        totals.total,
        'completed',
        orderDate
      ]
    );
    
    const saleId = saleResult.rows[0].id;
    
    // 4. Insertar los items de la venta Y actualizar el stock
    for (const item of items) {
      // Insertar item de venta
      await client.query(
        `INSERT INTO sale_items (
          sale_id,
          product_id,
          product_name,
          quantity,
          size,
          color,
          price,
          subtotal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          saleId,
          item.productId,
          item.productName,
          item.quantity,
          item.size,
          item.color,
          item.price,
          item.subtotal
        ]
      );
      
      // IMPORTANTE: Actualizar el stock del producto
      await client.query(
        'UPDATE products SET stock = stock - $1, reviews = reviews + $2, updated_at = NOW() WHERE id = $3',
        [item.quantity, item.quantity, item.productId]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Venta registrada exitosamente',
      orderNumber: orderNumber,
      sale: saleResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error procesando venta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar la venta',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// Obtener todas las ventas (con filtros)
app.get('/api/sales', async (req, res) => {
  try {
    const { startDate, endDate, status, month, year } = req.query;
    
    let query = `
      SELECT 
        s.*,
        COUNT(si.id) as items_count,
        SUM(si.quantity) as total_items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND s.order_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND s.order_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    if (status && status !== 'all') {
      query += ` AND s.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM s.order_date) = $${paramCount}`;
      params.push(parseInt(month));
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM s.order_date) = $${paramCount}`;
      params.push(parseInt(year));
      paramCount++;
    }

    query += ` GROUP BY s.id ORDER BY s.order_date DESC`;

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      sales: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo ventas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ventas'
    });
  }
});

// Obtener una venta específica con sus items
app.get('/api/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const saleResult = await pool.query(
      'SELECT * FROM sales WHERE id = $1',
      [id]
    );
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }
    
    const itemsResult = await pool.query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [id]
    );
    
    res.json({
      success: true,
      sale: {
        ...saleResult.rows[0],
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Error obteniendo venta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener venta'
    });
  }
});

// Obtener estadísticas de ventas
app.get('/api/sales/stats/summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (month && year) {
      dateFilter = 'WHERE EXTRACT(MONTH FROM order_date) = $1 AND EXTRACT(YEAR FROM order_date) = $2';
      params.push(parseInt(month), parseInt(year));
    } else if (year) {
      dateFilter = 'WHERE EXTRACT(YEAR FROM order_date) = $1';
      params.push(parseInt(year));
    }
    
    // Total de ventas
    const totalSales = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as average_order_value
      FROM sales ${dateFilter}`,
      params
    );
    
    // Ventas por mes (últimos 6 meses)
    const monthlySales = await pool.query(
      `SELECT 
        TO_CHAR(order_date, 'Mon') as month,
        EXTRACT(MONTH FROM order_date) as month_num,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
      FROM sales
      WHERE order_date >= NOW() - INTERVAL '6 months'
      GROUP BY month, month_num
      ORDER BY month_num`
    );
    
    // Productos más vendidos
    const topProducts = await pool.query(
      `SELECT 
        si.product_name,
        SUM(si.quantity) as total_sold,
        SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${dateFilter.replace('order_date', 's.order_date')}
      GROUP BY si.product_name
      ORDER BY total_sold DESC
      LIMIT 10`,
      params
    );
    
    res.json({
      success: true,
      stats: {
        summary: totalSales.rows[0],
        monthly: monthlySales.rows,
        topProducts: topProducts.rows
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de ventas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
});

// Actualizar estado de una venta
app.patch('/api/sales/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }
    
    const result = await pool.query(
      'UPDATE sales SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }
    
    res.json({
      success: true,
      message: 'Estado actualizado',
      sale: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estado'
    });
  }
});

console.log('✅ Rutas de ventas configuradas');

// ============================================
// AGREGAR ESTAS RUTAS EN TU server.js
// Después de tus rutas existentes y antes de app.listen()
// ============================================

// ============================================
// ESTADÍSTICAS COMPLETAS DEL INVENTARIO
// ============================================
app.get('/api/inventory/stats', async (req, res) => {
  try {
    // Total de productos
    const totalProducts = await pool.query('SELECT COUNT(*) as count FROM products');
    
    // Stock bajo (menos de 20 unidades)
    const lowStock = await pool.query('SELECT COUNT(*) as count FROM products WHERE stock < 20');
    
    // Productos agotados
    const outOfStock = await pool.query('SELECT COUNT(*) as count FROM products WHERE stock = 0');
    
    // Valor total del inventario
    const totalValue = await pool.query('SELECT SUM(price * stock) as total FROM products');
    
    // Total de ventas realizadas
    const totalSales = await pool.query('SELECT COUNT(*) as count FROM sales');
    
    // Ingresos totales
    const totalRevenue = await pool.query('SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE status = $1', ['completed']);
    
    // Productos más vendidos (por cantidad)
    const topProductsBySales = await pool.query(`
      SELECT 
        si.product_name,
        si.product_id,
        SUM(si.quantity) as total_sold,
        SUM(si.subtotal) as total_revenue,
        p.stock as current_stock,
        p.price as current_price
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.status = 'completed'
      GROUP BY si.product_name, si.product_id, p.stock, p.price
      ORDER BY total_sold DESC
      LIMIT 10
    `);
    
    // Productos con stock crítico
    const criticalStock = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(si.quantity), 0) as total_sold
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      WHERE p.stock < 10
      GROUP BY p.id
      ORDER BY total_sold DESC, p.stock ASC
      LIMIT 10
    `);
    
    // Resumen por categoría
    const categoryStats = await pool.query(`
      SELECT 
        category,
        COUNT(*) as product_count,
        SUM(stock) as total_stock,
        SUM(price * stock) as total_value,
        AVG(stock) as avg_stock
      FROM products
      GROUP BY category
      ORDER BY total_value DESC
    `);
    
    res.json({
      success: true,
      stats: {
        overview: {
          totalProducts: parseInt(totalProducts.rows[0].count),
          lowStock: parseInt(lowStock.rows[0].count),
          outOfStock: parseInt(outOfStock.rows[0].count),
          totalValue: parseFloat(totalValue.rows[0].total || 0),
          totalSales: parseInt(totalSales.rows[0].count),
          totalRevenue: parseFloat(totalRevenue.rows[0].total || 0)
        },
        topProducts: topProductsBySales.rows,
        criticalStock: criticalStock.rows,
        byCategory: categoryStats.rows
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del inventario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener estadísticas',
      error: error.message 
    });
  }
});

// ============================================
// HISTORIAL DE VENTAS POR PRODUCTO
// ============================================
app.get('/api/products/:id/sales-history', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        s.order_date,
        s.order_number,
        si.quantity,
        si.price,
        si.subtotal,
        si.size,
        si.color,
        s.customer_first_name,
        s.customer_last_name,
        s.customer_email
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE si.product_id = $1 AND s.status = 'completed'
    `;
    
    const params = [id];
    let paramCount = 2;
    
    if (startDate) {
      query += ` AND s.order_date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND s.order_date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ' ORDER BY s.order_date DESC';
    
    const salesHistory = await pool.query(query, params);
    
    // Calcular estadísticas del producto
    const stats = await pool.query(`
      SELECT 
        p.name,
        p.sku,
        p.stock as current_stock,
        p.price as current_price,
        COALESCE(SUM(si.quantity), 0) as total_sold,
        COALESCE(SUM(si.subtotal), 0) as total_revenue,
        COUNT(DISTINCT s.id) as total_orders,
        AVG(si.quantity) as avg_quantity_per_order
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
      WHERE p.id = $1
      GROUP BY p.id, p.name, p.sku, p.stock, p.price
    `, [id]);
    
    res.json({
      success: true,
      product: stats.rows[0] || null,
      salesHistory: salesHistory.rows
    });
  } catch (error) {
    console.error('Error obteniendo historial de ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener historial',
      error: error.message 
    });
  }
});

// ============================================
// ALERTAS DE INVENTARIO
// ============================================
app.get('/api/inventory/alerts', async (req, res) => {
  try {
    // Productos con stock bajo
    const lowStockAlerts = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(si.quantity), 0) as total_sold,
        COALESCE(COUNT(DISTINCT s.id), 0) as total_orders
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
      WHERE p.stock < 20 AND p.stock > 0
      GROUP BY p.id
      ORDER BY p.stock ASC, total_sold DESC
    `);
    
    // Productos agotados
    const outOfStockAlerts = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(si.quantity), 0) as total_sold,
        COALESCE(COUNT(DISTINCT s.id), 0) as total_orders
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
      WHERE p.stock = 0
      GROUP BY p.id
      ORDER BY total_sold DESC
    `);
    
    // Productos con alta demanda
    const highDemandAlerts = await pool.query(`
      SELECT 
        p.*,
        SUM(si.quantity) as total_sold,
        COUNT(DISTINCT s.id) as total_orders,
        AVG(si.quantity) as avg_quantity_per_order
      FROM products p
      JOIN sale_items si ON p.id = si.product_id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'completed'
      GROUP BY p.id
      HAVING SUM(si.quantity) > 50
      ORDER BY total_sold DESC
    `);
    
    res.json({
      success: true,
      alerts: {
        lowStock: lowStockAlerts.rows,
        outOfStock: outOfStockAlerts.rows,
        highDemand: highDemandAlerts.rows
      }
    });
  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener alertas',
      error: error.message 
    });
  }
});

// ============================================
// DASHBOARD COMPLETO CON TODAS LAS MÉTRICAS
// ============================================
app.get('/api/dashboard/stats-complete', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (startDate && endDate) {
      dateFilter = 'WHERE s.order_date BETWEEN $1 AND $2 AND s.status = $3';
      params.push(startDate, endDate, 'completed');
    } else {
      dateFilter = 'WHERE s.status = $1';
      params.push('completed');
    }
    
    // Ventas totales
    const salesStats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as average_order_value,
        COALESCE(SUM(subtotal), 0) as total_subtotal,
        COALESCE(SUM(shipping_cost), 0) as total_shipping,
        COALESCE(SUM(tax), 0) as total_tax
      FROM sales s
      ${dateFilter}
    `, params);
    
    // Productos vendidos
    const productStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT si.product_id) as unique_products_sold,
        COALESCE(SUM(si.quantity), 0) as total_units_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${dateFilter}
    `, params);
    
    // Inventario
    const inventoryStats = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(stock) as total_stock,
        SUM(price * stock) as total_value,
        COUNT(CASE WHEN stock < 20 THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN stock = 0 THEN 1 END) as out_of_stock_count
      FROM products
    `);
    
    // Clientes únicos
    const customerStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT customer_email) as unique_customers
      FROM sales s
      ${dateFilter}
    `, params);
    
    // Ventas por mes (últimos 6 meses)
    const monthlySales = await pool.query(`
      SELECT 
        TO_CHAR(order_date, 'Mon') as month,
        EXTRACT(MONTH FROM order_date) as month_num,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM(subtotal), 0) as subtotal
      FROM sales
      WHERE order_date >= NOW() - INTERVAL '6 months' AND status = 'completed'
      GROUP BY month, month_num
      ORDER BY month_num
    `);
    
    // Top 10 productos más vendidos
    const topProducts = await pool.query(`
      SELECT 
        si.product_name,
        SUM(si.quantity) as total_sold,
        SUM(si.subtotal) as total_revenue,
        COUNT(DISTINCT s.id) as order_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${dateFilter}
      GROUP BY si.product_name
      ORDER BY total_sold DESC
      LIMIT 10
    `, params);
    
    // Ventas por categoría
    const categorySales = await pool.query(`
      SELECT 
        p.category,
        COUNT(DISTINCT si.sale_id) as order_count,
        SUM(si.quantity) as total_sold,
        SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      ${dateFilter}
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `, params);
    
    res.json({
      success: true,
      stats: {
        sales: salesStats.rows[0],
        products: productStats.rows[0],
        inventory: inventoryStats.rows[0],
        customers: customerStats.rows[0],
        monthlySales: monthlySales.rows,
        topProducts: topProducts.rows,
        categorySales: categorySales.rows
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas completas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener estadísticas',
      error: error.message 
    });
  }
});

console.log('✅ Rutas de estadísticas mejoradas configuradas correctamente');









// Iniciar servidor
const PORT = process.env.PORT || 5000;

// Función para inicializar todo
async function startServer() {
  try {
    // 1. Primero inicializar la base de datos (crear tablas)
    console.log('🔄 Inicializando base de datos...');
    await initDatabase();
    
    // 2. Luego crear los usuarios admin
    console.log('👥 Configurando usuarios admin...');
    await setupAdmins();
    
    // 3. Finalmente iniciar el servidor
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 CORS habilitado para: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      console.log('✅ Sistema listo!');
    });
    
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// Iniciar
startServer();