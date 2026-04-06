const pool = require('./src/config/db');

async function migrate() {
    try {
        console.log('Migrating database schema...');
        
        // Tambahkan channel_message_id (jika belum ada)
        try {
            await pool.execute('ALTER TABLE albums ADD COLUMN channel_message_id BIGINT NULL AFTER moderator_message_id;');
            console.log('Added channel_message_id column.');
        } catch (e) { if (e.errno !== 1060) throw e; }

        // Tambahkan media_group_id (jika belum ada)
        try {
            await pool.execute('ALTER TABLE albums ADD COLUMN media_group_id VARCHAR(100) NULL AFTER user_id;');
            console.log('Added media_group_id column.');
        } catch (e) { if (e.errno !== 1060) throw e; }

        // Tambahkan moderator_media_ids (jika belum ada)
        try {
            await pool.execute('ALTER TABLE albums ADD COLUMN moderator_media_ids TEXT NULL AFTER moderator_message_id;');
            console.log('Added moderator_media_ids column.');
        } catch (e) { if (e.errno !== 1060) throw e; }

        // --- OPTIMASI INDEKS (Hardening Tahap 5) ---
        console.log('Optimizing indexes...');
        
        // Index Unique Token
        try {
            await pool.execute('ALTER TABLE albums ADD UNIQUE INDEX idx_unique_token (unique_token);');
            console.log('Added UNIQUE index to unique_token.');
        } catch (e) { if (e.errno !== 1061) throw e; }

        // Index Status & UserID (untuk filter cepat)
        try {
            await pool.execute('ALTER TABLE albums ADD INDEX idx_status (status);');
            await pool.execute('ALTER TABLE albums ADD INDEX idx_user_id (user_id);');
            console.log('Added status & user_id indexes.');
        } catch (e) { if (e.errno !== 1061) throw e; }

        // Buat tabel downloads jika belum ada (untuk Unique Downloads)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS downloads (
                id INT AUTO_INCREMENT PRIMARY KEY,
                album_id INT NOT NULL,
                user_id BIGINT NOT NULL,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_download (album_id, user_id),
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Verified downloads table.');
        
        // Buat tabel activity_logs (Hardening Tahap 5)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                action VARCHAR(50) NOT NULL,
                user_id BIGINT NOT NULL,
                target_id INT NULL,
                details TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_action (action),
                INDEX idx_user_action (user_id, action)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Verified activity_logs table.');

        // Tambahkan is_public dan anonymous_id ke tabel users (Hardening Tahap 7 & 8)
        try {
            await pool.execute('ALTER TABLE users ADD COLUMN is_public BOOLEAN DEFAULT TRUE AFTER is_admin;');
            console.log('Added is_public column to users.');
        } catch (e) { if (e.errno !== 1060) throw e; }

        try {
            await pool.execute('ALTER TABLE users ADD COLUMN anonymous_id VARCHAR(16) UNIQUE AFTER is_public;');
            console.log('Added anonymous_id column to users.');
        } catch (e) { if (e.errno !== 1060) throw e; }

        console.log('Migration successful.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
