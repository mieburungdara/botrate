const db = require('../config/db');
const { submitToModeration } = require('../helpers/moderation');
const { AlbumStatus } = require('../constants/status');

/**
 * Handle WebApp requests
 */

async function getUserProfile(req, res) {
    try {
        const userId = req.user.user_id;
        
        const [users] = await db.execute(
            'SELECT user_id, username, first_name, last_name, created_at, anonymous_id, is_public, is_admin FROM users WHERE user_id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Agregasi Real-Time sebagai sumber kebenaran (Fix Bug 48)
        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_albums,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as approved_albums,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as rejected_albums,
                COALESCE(SUM(download_count), 0) as total_downloads,
                COALESCE(AVG(rating_avg), 0) as avg_rating
            FROM albums WHERE user_id = ? AND status = 'approved'
        `, [AlbumStatus.APPROVED, AlbumStatus.REJECTED, userId]);

        const profileData = users[0];
        const userStats = stats[0] || { total_albums: 0, approved_albums: 0, rejected_albums: 0, total_downloads: 0, avg_rating: 0 };

        // Gabungkan data agar is_admin terpapar ke WebApp (Fix Bug 47)
        res.json({
            profile: {
                ...profileData,
                download_count: parseInt(userStats.total_downloads),
                album_count: parseInt(userStats.approved_albums)
            },
            stats: userStats
        });
    } catch (error) {
        console.error('[WebApp] getUserProfile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function getUserAlbums(req, res) {
    try {
        const userId = req.user.user_id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const [albums] = await db.execute(`
            SELECT 
                id, caption, status, download_count, rating_avg, rating_count, 
                created_at, approved_at, media_items, message_ids, unique_token
            FROM albums 
            WHERE user_id = ? AND status = 'approved'
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);

        const processedAlbums = albums.map(album => {
            let media_count = 0;
            try {
                if (album.media_items) media_count = JSON.parse(album.media_items).length;
                else if (album.message_ids) media_count = JSON.parse(album.message_ids).length;
            } catch (e) { media_count = 0; }
            const { media_items, message_ids, ...rest } = album;
            return { ...rest, media_count };
        });

        const [totalRows] = await db.execute(
            'SELECT COUNT(*) as total FROM albums WHERE user_id = ? AND status = ?',
            [userId, AlbumStatus.APPROVED]
        );

        res.json({
            albums: processedAlbums,
            total: totalRows[0].total,
            page,
            limit
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function getUserPendingMedia(req, res) {
    try {
        const userId = req.user.user_id;
    const [rows] = await db.execute(`
        SELECT id, caption, created_at, media_items, message_ids
        FROM albums 
        WHERE user_id = ? AND status IN ('draft', 'pending')
        ORDER BY created_at DESC
    `, [userId]);

        const processed = rows.map(album => {
            let media_count = 0;
            try {
                if (album.media_items) media_count = JSON.parse(album.media_items).length;
                else if (album.message_ids) media_count = JSON.parse(album.message_ids).length;
            } catch (e) { media_count = 0; }
            return { ...album, media_count };
        });

        res.json({ media: processed });
    } catch (error) {
        res.status(500).json({ error: 'Gagal memuat media pending' });
    }
}

async function submitMedia(req, res) {
    try {
        const userId = req.user.user_id;
        const albumId = req.params.id;
        
        // Input validation for albumId
        if (!albumId || !/^\d+$/.test(albumId)) {
            return res.status(400).json({ error: 'ID album tidak valid' });
        }
        
        const [rows] = await db.execute(
            "SELECT id, user_id, status FROM albums WHERE id = ? AND user_id = ?", 
            [albumId, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Media tidak ditemukan' });
        }

        const album = rows[0];
        if (album.status !== 'pending' && album.status !== 'draft') {
            return res.status(400).json({ error: 'Media sudah dikirim atau sudah diproses' });
        }

        const result = await submitToModeration(albumId);
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengirim ke moderasi' });
    }
}

async function updateMediaCaption(req, res) {
    try {
        const userId = req.user.user_id;
        const albumId = req.params.id;
        const { caption } = req.body;

        // Input validation for albumId
        if (!albumId || !/^\d+$/.test(albumId)) {
            return res.status(400).json({ error: 'ID album tidak valid' });
        }

        const [rows] = await db.execute('SELECT id, user_id, status FROM albums WHERE id = ?', [albumId]);
        if (rows.length === 0 || rows[0].user_id != userId) {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        if (rows[0].status !== 'pending' && rows[0].status !== 'draft') {
            return res.status(400).json({ error: 'Tidak bisa mengubah media yang sedang dimoderasi' });
        }

        await db.execute('UPDATE albums SET caption = ? WHERE id = ?', [caption, albumId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Gagal menghapus media' });
    }
}

async function getAlbumDownloadStats(req, res) {
    try {
        const userId = req.user.user_id;
        const albumId = req.params.id;

        // Input validation for albumId
        if (!albumId || !/^\d+$/.test(albumId)) {
            return res.status(400).json({ error: 'ID album tidak valid' });
        }

        const [albumRows] = await db.execute('SELECT id FROM albums WHERE id = ? AND user_id = ?', [albumId, userId]);
        if (albumRows.length === 0) {
            return res.status(404).json({ error: 'Media tidak ditemukan' });
        }

        const [stats] = await db.execute(`
            SELECT u.anonymous_id, u.is_public, d.downloaded_at
            FROM downloads d
            LEFT JOIN users u ON d.user_id = u.user_id
            WHERE d.album_id = ?
            ORDER BY d.downloaded_at DESC
        `, [albumId]);

        const maskedStats = stats.map(s => ({
            downloaded_at: s.downloaded_at,
            anonymous_id: s.is_public ? (s.anonymous_id || "Pengguna Anonim") : "Pengguna Anonim"
        }));

        res.json({ stats: maskedStats });
    } catch (error) {
        res.status(500).json({ error: 'Gagal memuat statistik unduhan' });
    }
}

async function updateUserSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { is_public } = req.body;
        await db.execute('UPDATE users SET is_public = ? WHERE user_id = ?', [is_public ? 1 : 0, userId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function deleteAlbum(req, res) {
    try {
        const userId = req.user.user_id;
        const albumId = req.params.id;

        // Input validation for albumId
        if (!albumId || !/^\d+$/.test(albumId)) {
            return res.status(400).json({ error: 'ID album tidak valid' });
        }

        const [rows] = await db.execute('SELECT id, status FROM albums WHERE id = ? AND user_id = ?', [albumId, userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Media tidak ditemukan' });
        }

        if (rows[0].status !== 'pending') {
            return res.status(400).json({ error: 'Tidak dapat menghapus media yang sudah diproses. Hanya media pending yang bisa dihapus.' });
        }

        // Hapus media dan kurangi penghitung secara seirama (Fix Bug 94)
        await db.execute('DELETE FROM albums WHERE id = ?', [albumId]);
        await db.execute('UPDATE users SET album_count = (SELECT COUNT(*) FROM albums WHERE user_id = ? AND status = ?)', [userId, AlbumStatus.APPROVED]);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Gagal menghapus media' });
    }
}

async function getGlobalStats(req, res) {
    try {
        const [admins] = await db.execute('SELECT is_admin FROM users WHERE user_id = ?', [req.user.user_id]);
        if (!admins[0]?.is_admin) return res.status(403).json({ error: 'Forbidden' });

        const [userCount] = await db.execute('SELECT COUNT(*) as total FROM users');
        const [albumStats] = await db.execute(`
            SELECT 
                COUNT(*) as total_albums,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_albums,
                SUM(download_count) as total_downloads,
                IFNULL(ROUND(SUM(rating_total) / NULLIF(SUM(rating_count), 0), 2), 0) as global_avg_rating
            FROM albums WHERE status = 'approved'
        `);

        res.json({
            total_users: userCount[0].total,
            total_albums: albumStats[0].total_albums || 0,
            approved_albums: albumStats[0].approved_albums || 0,
            total_downloads: albumStats[0].total_downloads || 0,
            global_avg_rating: parseFloat(Number(albumStats[0].global_avg_rating || 0).toFixed(2))
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function searchAlbumsByAnonId(req, res) {
    try {
        let { anon_id } = req.query;
        if (!anon_id) return res.status(400).json({ error: 'ID Anonim wajib diisi' });
        
        // Pembersihan & Normalisasi Input (Fix Bug 82)
        const cleanId = anon_id.replace('#', '').trim().toUpperCase();
        
        // Cari user yang memiliki ID tersebut (Gunakan LIKE untuk fleksibilitas prefix)
        const searchPattern = cleanId.startsWith('BA-') ? cleanId : `%${cleanId}`;
        const [users] = await db.execute(
            'SELECT user_id, first_name, anonymous_id, is_public FROM users WHERE anonymous_id LIKE ?', 
            [searchPattern]
        );

        // Validasi keberadaan user dan privasi profil
        if (users.length === 0) {
            return res.status(404).json({ error: 'Kreator tidak ditemukan. Periksa kembali ID Anda.' });
        }
        
        const user = users[0];
        if (!user.is_public) {
            return res.status(403).json({ error: 'Profil kreator ini bersifat privat.' });
        }

        const targetUserId = users[0].user_id;

        const [albums] = await db.execute(`
            SELECT id, caption, download_count, rating_avg, rating_count, created_at, media_items, unique_token
            FROM albums 
            WHERE user_id = ? AND status = 'approved'
            ORDER BY created_at DESC
        `, [targetUserId]);

        const processedAlbums = albums.map(album => {
            let media_count = 0;
            try {
                if (album.media_items) media_count = JSON.parse(album.media_items).length;
            } catch (e) { media_count = 0; }
            const { media_items, ...rest } = album;
            return { ...rest, media_count };
        });

        res.json({
            creator: { 
                // Jangan kirim nama asli Telegram untuk menjaga anonimitas (Fix Bug 46)
                display_name: `Kreator ${anon_id}`, 
                anonymous_id: anon_id 
            },
            albums: processedAlbums
        });
    } catch (error) {
        console.error('[Search] Error:', error);
        res.status(500).json({ error: 'Gagal mencari album' });
    }
}

module.exports = { 
    getUserProfile, 
    getUserAlbums, 
    getUserPendingMedia,
    submitMedia,
    updateMediaCaption,
    getGlobalStats, 
    deleteAlbum, 
    getAlbumDownloadStats, 
    updateUserSettings,
    searchAlbumsByAnonId
};