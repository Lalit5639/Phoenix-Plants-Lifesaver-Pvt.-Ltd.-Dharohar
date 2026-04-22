// server.js - Main backend server for Phoenix Plants Lifesaver
// Run with: node server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'phoenix_plants.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Initialize SQLite Database
const db = new sqlite3.Database(DATABASE_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log(`Connected to SQLite database at ${DATABASE_PATH}`);
        createTables();
    }
});

// Create all necessary tables
function createTables() {
    // Distributors table
    db.run(`CREATE TABLE IF NOT EXISTS distributors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        city TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Feedback table
    db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rating INTEGER NOT NULL,
        message TEXT NOT NULL,
        is_approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        old_price REAL,
        discount INTEGER,
        image TEXT,
        category TEXT,
        stock INTEGER DEFAULT 0,
        description TEXT
    )`);

    // Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        product_id INTEGER,
        quantity INTEGER DEFAULT 1,
        total_amount REAL,
        status TEXT DEFAULT 'pending',
        order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`);

    // Newsletter subscribers
    db.run(`CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Enquiries table
    db.run(`CREATE TABLE IF NOT EXISTS enquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert sample products if table is empty
    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
        if (err) {
            console.error('Error checking products:', err.message);
        } else if (row.count === 0) {
            const sampleProducts = [
                ['Bharat N.P.K.', 549, 1499, 64, '/images/p1.png', 'fertilizer', 500, 'High-quality NPK fertilizer for all crops'],
                ['Bharat Potash', 699, 1799, 61, '/images/p2.jpg', 'fertilizer', 450, 'Premium potash fertilizer for better yield'],
                ['Phino-Potash', 329, 514, 36, '/images/p3.png', 'fertilizer', 600, 'Organic potash solution'],
                ['Mono SSP', 799, 1599, 50, '/images/p4.png', 'fertilizer', 300, 'Single super phosphate fertilizer']
            ];
            const stmt = db.prepare(`INSERT INTO products (name, price, old_price, discount, image, category, stock, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            sampleProducts.forEach(p => {
                stmt.run(p, (err) => {
                    if (err) console.error('Error inserting sample product:', err.message);
                });
            });
            stmt.finalize();
            console.log('Sample products inserted');
        }
    });

    // Insert sample feedback if table is empty
    db.get(`SELECT COUNT(*) as count FROM feedback`, (err, row) => {
        if (err) {
            console.error('Error checking feedback:', err.message);
        } else if (row.count === 0) {
            const sampleFeedbacks = [
                ['Ramesh Patil', 5, 'Excellent quality seeds! My crop yield increased by 40% this season. Highly recommended!', 1],
                ['Savitri Devi', 5, 'The organic fertilizers from Phoenix Plants are amazing. Soil health improved dramatically.', 1],
                ['Amar Singh', 4, 'Good products and timely delivery. Customer support is very helpful.', 1]
            ];
            const stmt = db.prepare(`INSERT INTO feedback (name, rating, message, is_approved) VALUES (?, ?, ?, ?)`);
            sampleFeedbacks.forEach(f => {
                stmt.run(f, (err) => {
                    if (err) console.error('Error inserting sample feedback:', err.message);
                });
            });
            stmt.finalize();
            console.log('Sample feedback inserted');
        }
    });
}

// ==================== API ROUTES ====================

// Get all products
app.get('/api/products', (req, res) => {
    const { category, limit } = req.query;
    let query = 'SELECT * FROM products';
    let params = [];
    
    if (category) {
        query += ' WHERE category = ?';
        params.push(category);
    }
    
    query += ' ORDER BY id';
    
    if (limit) {
        query += ' LIMIT ?';
        params.push(parseInt(limit));
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get single product
app.get('/api/products/:id', (req, res) => {
    db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Product not found' });
            return;
        }
        res.json(row);
    });
});

// Submit distributor application
app.post('/api/distributors', (req, res) => {
    const { full_name, email, phone, city } = req.body;
    
    if (!full_name || !email || !phone) {
        res.status(400).json({ error: 'Name, email and phone are required' });
        return;
    }
    
    db.run(`INSERT INTO distributors (full_name, email, phone, city) VALUES (?, ?, ?, ?)`,
        [full_name, email, phone, city],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ 
                success: true, 
                message: 'Application submitted successfully!',
                id: this.lastID 
            });
        }
    );
});

// Get distributor applications (for admin panel)
app.get('/api/distributors', (req, res) => {
    db.all(
        'SELECT id, full_name, email, phone, city, status, created_at FROM distributors ORDER BY created_at DESC LIMIT 200',
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Submit feedback
app.post('/api/feedback', (req, res) => {
    const { name, rating, message } = req.body;
    
    if (!name || !rating || !message) {
        res.status(400).json({ error: 'Name, rating and message are required' });
        return;
    }
    
    db.run(`INSERT INTO feedback (name, rating, message, is_approved) VALUES (?, ?, ?, 0)`,
        [name, rating, message],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ 
                success: true, 
                message: 'Thank you for your feedback! It will be reviewed shortly.' 
            });
        }
    );
});

// Get feedback list for admin (pending first)
app.get('/api/admin/feedback', (req, res) => {
    db.all(
        `SELECT id, name, rating, message, is_approved, created_at
         FROM feedback
         ORDER BY is_approved ASC, created_at DESC
         LIMIT 200`,
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Get approved feedback
app.get('/api/feedback', (req, res) => {
    db.all('SELECT name, rating, message, created_at FROM feedback WHERE is_approved = 1 ORDER BY created_at DESC LIMIT 20',
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Submit order
app.post('/api/orders', (req, res) => {
    const { customer_name, customer_email, customer_phone, shipping_address, product_id, quantity, total_amount } = req.body;
    
    if (!customer_name || !customer_email || !customer_phone || !shipping_address || !product_id) {
        res.status(400).json({ error: 'All order fields are required' });
        return;
    }
    
    db.run(`INSERT INTO orders (customer_name, customer_email, customer_phone, shipping_address, product_id, quantity, total_amount) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [customer_name, customer_email, customer_phone, shipping_address, product_id, quantity || 1, total_amount],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ 
                success: true, 
                message: 'Order placed successfully!',
                order_id: this.lastID 
            });
        }
    );
});

// Get recent orders (for admin panel)
app.get('/api/orders', (req, res) => {
    db.all(
        `SELECT id, customer_name, product_id, quantity, total_amount, status, order_date
         FROM orders
         ORDER BY order_date DESC
         LIMIT 200`,
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Newsletter subscription
app.post('/api/subscribe', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
    }
    
    db.run(`INSERT OR IGNORE INTO subscribers (email) VALUES (?)`, [email], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.json({ success: false, message: 'Email already subscribed!' });
        } else {
            res.json({ success: true, message: 'Subscribed successfully!' });
        }
    });
});

// Submit enquiry
app.post('/api/enquiry', (req, res) => {
    const { name, email, phone, message } = req.body;
    
    if (!name || !email || !message) {
        res.status(400).json({ error: 'Name, email and message are required' });
        return;
    }
    
    db.run(`INSERT INTO enquiries (name, email, phone, message) VALUES (?, ?, ?, ?)`,
        [name, email, phone, message],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ 
                success: true, 
                message: 'Enquiry sent successfully! We will contact you soon.' 
            });
        }
    );
});

// Get dashboard stats (for admin panel)
app.get('/api/admin/stats', (req, res) => {
    const stats = {
        distributors: 0,
        pending_feedback: 0,
        orders: 0,
        subscribers: 0
    };

    const queries = [
        new Promise((resolve) => {
            db.get('SELECT COUNT(*) as total FROM distributors', (err, row) => {
                if (!err && row) stats.distributors = row.total;
                resolve();
            });
        }),
        new Promise((resolve) => {
            db.get('SELECT COUNT(*) as total FROM feedback WHERE is_approved = 0', (err, row) => {
                if (!err && row) stats.pending_feedback = row.total;
                resolve();
            });
        }),
        new Promise((resolve) => {
            db.get('SELECT COUNT(*) as total FROM orders', (err, row) => {
                if (!err && row) stats.orders = row.total;
                resolve();
            });
        }),
        new Promise((resolve) => {
            db.get('SELECT COUNT(*) as total FROM subscribers', (err, row) => {
                if (!err && row) stats.subscribers = row.total;
                resolve();
            });
        })
    ];

    Promise.all(queries).then(() => res.json(stats));
});

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});
