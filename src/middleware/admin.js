const db = require('../config/db');

async function adminMiddleware(ctx, next) {
    if (!ctx.from) return ctx.answerCbQuery ? 
        ctx.answerCbQuery('Unauthorized', true) : 
        ctx.reply('Unauthorized');

    const [rows] = await db.execute(
        'SELECT is_admin FROM users WHERE user_id = ?',
        [ctx.from.id]
    );

    if (rows.length === 0 || !rows[0].is_admin) {
        return ctx.answerCbQuery ? 
            ctx.answerCbQuery('Anda bukan admin', true) : 
            ctx.reply('Anda bukan admin');
    }

    ctx.state.isAdmin = true;
    return next();
}

module.exports = { adminMiddleware };
