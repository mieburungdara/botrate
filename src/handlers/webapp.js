const db = require('../config/db');

async function getUserProfile(req, res) {
    try {
        const userId = req.user.id;
        
        const [users] = await db.execute(
            'SELECT user_id, username, first_name, last_name, album_count, download_count, created_at FROM users WHERE user_id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_albums,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_albums,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_albums,
                COALESCE(SUM(download_count), 0) as total_downloads,
                COALESCE(AVG(rating_avg), 0) as avg_rating
            FROM albums WHERE user_id = ?
        `, [userId]);

        res.json({
            profile: users[0],
            stats: stats[0]
        });
    } catch (error) {
        console.error('[WebApp] getUserProfile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function getUserAlbums(req, res) {
    try {
        const userId = req.user.id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const [albums] = await db.execute(`
            SELECT 
                id, caption, status, download_count, rating_avg, rating_count, 
                created_at, approved_at, media_items, message_ids
            FROM albums 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);

        // Hitung jumlah media per album
        const processedAlbums = albums.map(album => {
            let media_count = 0;
            try {
                if (album.media_items) {
                    media_count = JSON.parse(album.media_items).length;
                } else if (album.message_ids) {
                    media_count = JSON.parse(album.message_ids).length;
                }
            } catch (e) { media_count = 0; }

            const { media_items, message_ids, ...rest } = album;
            return { ...rest, media_count };
        });

        const [totalRows] = await db.execute(
            'SELECT COUNT(*) as total FROM albums WHERE user_id = ?',
            [userId]
        );

        res.json({
            albums: processedAlbums,
            total: totalRows[0].total,
            page,
            limit
        });
    } catch (error) {
        console.error('[WebApp] getUserAlbums error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function deleteAlbum(req, res) {
    try {
        const userId = req.user.id;
        const albumId = req.params.id;

        // Validasi kepemilikan
        const [rows] = await db.execute('SELECT id FROM albums WHERE id = ? AND user_id = ?', [albumId, userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Album tidak ditemukan atau bukan milik Anda' });
        }

        await db.execute('DELETE FROM albums WHERE id = ?', [albumId]);
        res.json({ success: true, message: 'Album berhasil dihapus' });
    } catch (error) {
        console.error('[WebApp] deleteAlbum error:', error);
        res.status(500).json({ error: 'Gagal menghapus album' });
    }
}

async function getAlbumDownloadStats(req, res) {
    try {
        const userId = req.user.id;
        const albumId = req.params.id;

        // Validasi kepemilikan
        const [albumRows] = await db.execute('SELECT id FROM albums WHERE id = ? AND user_id = ?', [albumId, userId]);
        if (albumRows.length === 0) {
            return res.status(404).json({ error: 'Album tidak ditemukan' });
        }

        // Ambil riwayat download beserta info usernya (Join ke tabel users)
        const [stats] = await db.execute(`
            SELECT d.user_id, u.first_name, u.username, d.downloaded_at
            FROM downloads d
            LEFT JOIN users u ON d.user_id = u.user_id
            WHERE d.album_id = ?
            ORDER BY d.downloaded_at DESC
            LIMIT 100
        `, [albumId]);

        res.json({
            album_id: albumId,
            stats
        });
    } catch (error) {
        console.error('[WebApp] getAlbumDownloadStats error:', error);
        res.status(500).json({ error: 'Gagal memuat statistik unduhan' });
    }
}

async function getGlobalStats(req, res) {
    try {
        const [admins] = await db.execute(
            'SELECT is_admin FROM users WHERE user_id = ?',
            [req.user.id]
        );

        if (!admins[0]?.is_admin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const [userCount] = await db.execute('SELECT COUNT(*) as total FROM users');
        const [albumStats] = await db.execute(`
            SELECT 
                COUNT(*) as total_albums,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_albums,
                SUM(download_count) as total_downloads,
                AVG(CASE WHEN rating_count > 0 THEN rating_avg END) as global_avg_rating
            FROM albums
        `);

        const stats = {
            total_users: userCount[0].total,
            total_albums: albumStats[0].total_albums || 0,
            approved_albums: albumStats[0].approved_albums || 0,
            total_downloads: albumStats[0].total_downloads || 0,
            global_avg_rating: parseFloat(Number(albumStats[0].global_avg_rating || 0).toFixed(2))
        };

        res.json(stats);
    } catch (error) {
        console.error('[WebApp] getGlobalStats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { getUserProfile, getUserAlbums, getGlobalStats, deleteAlbum, getAlbumDownloadStats };
