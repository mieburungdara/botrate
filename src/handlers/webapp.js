const db = require('../config/db');

async function getUserProfile(req, res) {
    const userId = req.user.id;
    
    const [users] = await db.execute(
        'SELECT user_id, username, first_name, last_name, album_count, download_count, created_at FROM users WHERE user_id = ?',
        [userId]
    );

    const [stats] = await db.execute(`
        SELECT 
            COUNT(*) as total_albums,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_albums,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_albums,
            SUM(download_count) as total_downloads,
            AVG(rating_avg) as avg_rating
        FROM albums WHERE user_id = ?
    `, [userId]);

    res.json({
        profile: users[0],
        stats: stats[0]
    });
}

async function getUserAlbums(req, res) {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [albums] = await db.execute(`
        SELECT id, caption, status, download_count, rating_avg, rating_count, created_at, approved_at
        FROM albums 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const [total] = await db.execute(
        'SELECT COUNT(*) as total FROM albums WHERE user_id = ?',
        [userId]
    );

    res.json({
        albums,
        total: total[0].total,
        page,
        limit
    });
}

async function getGlobalStats(req, res) {
    const [admins] = await db.execute(
        'SELECT is_admin FROM users WHERE user_id = ?',
        [req.user.id]
    );

    if (!admins[0]?.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const [stats] = await db.execute(`
        SELECT 
            COUNT(*) as total_users,
            (SELECT COUNT(*) FROM albums) as total_albums,
            (SELECT COUNT(*) FROM albums WHERE status = 'approved') as approved_albums,
            (SELECT SUM(download_count) FROM albums) as total_downloads,
            (SELECT AVG(rating_avg) FROM albums WHERE rating_count > 0) as global_avg_rating
        FROM users
    `);

    res.json(stats[0]);
}

module.exports = { getUserProfile, getUserAlbums, getGlobalStats };
