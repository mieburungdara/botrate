const db = require('../config/db');

async function userMiddleware(ctx, next) {
    if (!ctx.from) return next();

    const { id, username, first_name, last_name } = ctx.from;
    
    try {
        await db.execute(`
            INSERT INTO users (user_id, username, first_name, last_name)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                last_active = CURRENT_TIMESTAMP
        `, [id, username, first_name, last_name]);

        ctx.state.user = { id, username, first_name, last_name };
    } catch (error) {
        console.error('User middleware error:', error);
    }

    return next();
}

module.exports = { userMiddleware };
