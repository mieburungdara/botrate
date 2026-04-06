const { verifyWebAppInitData, parseInitData } = require('../helpers/webapp');
const db = require('../config/db');

function webAppAuthMiddleware(req, res, next) {
    const authHeader = req.headers['x-telegram-init-data'];
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!verifyWebAppInitData(authHeader)) {
        return res.status(401).json({ error: 'Invalid authentication' });
    }

    const initData = parseInitData(authHeader);
    const tgUser = initData.user;

    if (!tgUser || !tgUser.id) {
        return res.status(401).json({ error: 'Data user tidak valid' });
    }

    try {
        // Ambil data user dari Database (Zero-Trust Identity)
        const [rows] = await db.execute('SELECT * FROM users WHERE user_id = ?', [tgUser.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User tidak terdaftar di sistem' });
        }

        // Gunakan data dari DB untuk otorisasi (Fix Bug 91)
        req.user = rows[0];
        next();
    } catch (err) {
        console.error('[WebAppAuth:DB] Error fetching user:', err);
        // Generate error ID for tracking
        const errorId = Math.random().toString(36).substring(2, 9).toUpperCase();
        res.status(500).json({ error: 'Internal Auth Error', errorId });
    }
}

module.exports = { webAppAuthMiddleware };
