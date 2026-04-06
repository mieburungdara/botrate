const db = require('../config/db');
const crypto = require('crypto');

async function userMiddleware(ctx, next) {
    if (!ctx.from) return next();

    const { id, username, first_name, last_name } = ctx.from;
    
    try {
        // Pastikan user mendapatkan anonymous_id unik (Hardening Tahap 8 & 12)
        const [rows] = await db.execute('SELECT anonymous_id FROM users WHERE user_id = ?', [id]);
        
        // Generate ID baru jika user belum ada ATAU user ada tapi anonymous_id masih null/kosong
        let newAnonId = null;
        if (rows.length === 0 || !rows[0].anonymous_id) {
            // Generate cryptographically secure random ID
            const randomBytes = crypto.randomBytes(5); // 5 bytes = 40 bits
            newAnonId = 'BA-' + randomBytes.toString('hex').toUpperCase().substring(0, 9);
        }

        await db.execute(`
            INSERT INTO users (user_id, username, first_name, last_name, anonymous_id)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                last_active = CURRENT_TIMESTAMP,
                anonymous_id = COALESCE(users.anonymous_id, VALUES(anonymous_id))
        `, [id, username, first_name, last_name, newAnonId]);

        ctx.state.user = { id, username, first_name, last_name };
    } catch (error) {
        console.error('User middleware error:', error);
    }

    return next();
}

module.exports = { userMiddleware };
