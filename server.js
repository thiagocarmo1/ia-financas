// Polly e Thi finance - Backend Server (Node.js & Express & Supabase/PostgreSQL)
require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');

// Configuração VAPID para notificações Push
const VAPID_KEYS_FILE = path.join(__dirname, 'data', 'vapid-keys.json');
let vapidKeys;

if (fs.existsSync(VAPID_KEYS_FILE)) {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, 'utf8'));
} else {
    vapidKeys = webpush.generateVAPIDKeys();
    if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(vapidKeys), 'utf8');
}

webpush.setVapidDetails(
    'mailto:seu-email@dominio.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

// Configuração do Pool de Conexão com Supabase
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { family: 4 }, callback);
    }
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});
app.use(express.static(__dirname));

// ==================== INICIALIZAÇÃO DO BANCO ====================

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                profile JSONB DEFAULT '{"salary":0,"otherIncome":0,"rent":0,"consortium":0,"card":0,"bills":0,"market":0}',
                goals JSONB DEFAULT '[]',
                emergency_reserve NUMERIC DEFAULT 0,
                months JSONB DEFAULT '{}',
                push_subscription JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription JSONB');
        console.log('Banco de dados pronto!');
        await migrateFromJson();
    } catch (err) {
        console.error('Erro ao inicializar banco:', err);
    }
}
initDB();

// ==================== MIGRAÇÃO DE JSON PARA SUPABASE ====================

async function migrateFromJson() {
    const DB_FILE = path.join(__dirname, 'data', 'database.json');
    if (!fs.existsSync(DB_FILE)) return;
    try {
        const { rows } = await pool.query('SELECT count(*) FROM users');
        if (parseInt(rows[0].count) > 0) return;
        const localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (localData.users && localData.users.length > 0) {
            for (const u of localData.users) {
                await pool.query(
                    'INSERT INTO users (name, email, password, profile, goals, emergency_reserve, months) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [u.name, u.email.toLowerCase(), u.password, JSON.stringify(u.profile || {}), JSON.stringify(u.goals || []), u.emergencyReserve || 0, JSON.stringify(u.months || {})]
                );
            }
        }
    } catch (e) { console.error('Erro migração:', e); }
}

// ==================== ROTAS DE AUTENTICAÇÃO ====================

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    try {
        const result = await pool.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email', [name, email.toLowerCase(), password]);
        res.status(201).json({ success: true, user: result.rows[0] });
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
        res.status(500).json({ error: 'Erro ao registrar.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1 AND password = $2', [email.toLowerCase(), password]);
        if (rows.length === 0) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        res.json({ success: true, user: rows[0] });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Erro no servidor ao logar.' });
    }
});

// ==================== ROTAS FINANCEIRAS ====================

const getUserId = (req) => parseInt(req.headers['x-user-id']);

app.get('/api/financials', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Não autenticado.' });
    try {
        const { rows } = await pool.query('SELECT profile, goals, emergency_reserve, months FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        const user = rows[0];
        const monthSummaries = {};
        Object.entries(user.months || {}).forEach(([key, data]) => {
            const txs = data.transactions || [];
            const income = txs.filter(t => t.type === 'income-extra').reduce((s, t) => s + t.value, 0);
            const expenses = txs.filter(t => t.type.startsWith('expense')).reduce((s, t) => s + t.value, 0);
            monthSummaries[key] = { transactionCount: txs.length, totalIncome: income, totalExpenses: expenses, balance: income - expenses, closingBalance: data.closingBalance || 0 };
        });
        res.json({ success: true, profile: user.profile, goals: user.goals, emergencyReserve: parseFloat(user.emergency_reserve), months: monthSummaries });
    } catch (e) { res.status(500).json({ error: 'Erro carregar dados.' }); }
});

app.post('/api/financials', async (req, res) => {
    const userId = getUserId(req);
    const { profile, goals, emergencyReserve } = req.body;
    try {
        if (profile) await pool.query('UPDATE users SET profile = $1 WHERE id = $2', [JSON.stringify(profile), userId]);
        if (goals !== undefined) await pool.query('UPDATE users SET goals = $1 WHERE id = $2', [JSON.stringify(goals), userId]);
        if (emergencyReserve !== undefined) await pool.query('UPDATE users SET emergency_reserve = $1 WHERE id = $2', [emergencyReserve, userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Erro salvar.' }); }
});

app.get('/api/months/:yearMonth', async (req, res) => {
    const userId = getUserId(req);
    const { yearMonth } = req.params;
    try {
        const { rows } = await pool.query('SELECT months FROM users WHERE id = $1', [userId]);
        const monthData = rows[0].months[yearMonth] || { transactions: [], closingBalance: 0 };
        res.json({ success: true, yearMonth, transactions: monthData.transactions, closingBalance: monthData.closingBalance });
    } catch (e) { res.status(500).json({ error: 'Erro carregar mês.' }); }
});

app.post('/api/months/:yearMonth/transactions', async (req, res) => {
    const userId = getUserId(req);
    const { yearMonth } = req.params;
    try {
        const { rows } = await pool.query('SELECT months FROM users WHERE id = $1', [userId]);
        let months = rows[0].months || {};
        if (!months[yearMonth]) months[yearMonth] = { transactions: [], closingBalance: 0 };
        months[yearMonth].transactions.push(req.body);
        await pool.query('UPDATE users SET months = $1 WHERE id = $2', [JSON.stringify(months), userId]);
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Erro add.' }); }
});

app.delete('/api/months/:yearMonth/transactions/:id', async (req, res) => {
    const userId = getUserId(req);
    const { yearMonth, id } = req.params;
    try {
        const { rows } = await pool.query('SELECT months FROM users WHERE id = $1', [userId]);
        let months = rows[0].months || {};
        if (months[yearMonth]) {
            months[yearMonth].transactions = months[yearMonth].transactions.filter(t => t.id !== parseInt(id));
            await pool.query('UPDATE users SET months = $1 WHERE id = $2', [JSON.stringify(months), userId]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Erro del.' }); }
});

app.patch('/api/months/:yearMonth/closing', async (req, res) => {
    const userId = getUserId(req);
    const { yearMonth } = req.params;
    try {
        const { rows } = await pool.query('SELECT months FROM users WHERE id = $1', [userId]);
        let months = rows[0].months || {};
        if (!months[yearMonth]) months[yearMonth] = { transactions: [], closingBalance: 0 };
        months[yearMonth].closingBalance = req.body.closingBalance;
        await pool.query('UPDATE users SET months = $1 WHERE id = $2', [JSON.stringify(months), userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Erro closing.' }); }
});

app.get('/api/notifications/vapid-public-key', (req, res) => res.json({ publicKey: vapidKeys.publicKey }));
app.post('/api/notifications/subscribe', async (req, res) => {
    const userId = getUserId(req);
    try {
        await pool.query('UPDATE users SET push_subscription = $1 WHERE id = $2', [JSON.stringify(req.body.subscription), userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Erro sub.' }); }
});

app.post('/api/notifications/check-vencimentos', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { rows: users } = await pool.query('SELECT id, name, months, push_subscription FROM users WHERE push_subscription IS NOT NULL');
        let sent = 0;
        for (const user of users) {
            let pendingToday = [];
            Object.values(user.months || {}).forEach(m => {
                pendingToday = [...pendingToday, ...(m.transactions || []).filter(t => t.pending && t.dueDate === today)];
            });
            if (pendingToday.length > 0 && user.push_subscription) {
                try {
                    await webpush.sendNotification(user.push_subscription, JSON.stringify({ title: 'Lembrete 📅', body: `Você tem ${pendingToday.length} conta(s) vencendo hoje!`, icon: '/app_icon.png' }));
                    sent++;
                } catch (err) { if (err.statusCode === 410) await pool.query('UPDATE users SET push_subscription = NULL WHERE id = $1', [user.id]); }
            }
        }
        res.json({ success: true, sent });
    } catch (e) { res.status(500).json({ error: 'Erro check.' }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando porta ${PORT}`));
