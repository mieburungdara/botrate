const { Markup } = require('telegraf');
const db = require('../config/db');
const { generateToken, generateUniqueToken } = require('../helpers/token');
const { AlbumStatus } = require('../constants/status');

// Cache untuk menyimpan album yang sedang dikumpulkan
const albumCache = new Map();
const ALBUM_TIMEOUT = 5000; // 5 detik

/**
 * Mendapatkan kunci unik untuk cache album (Fix Bug 52)
 */
const getCacheKey = (userId, mediaGroupId) => `${userId}:${mediaGroupId}`;

async function handleAlbum(ctx) {
    const mediaGroupId = ctx.update.message.media_group_id;
    const userId = ctx.from.id;
    const cacheKey = getCacheKey(userId, mediaGroupId);

    const caption = ctx.message.caption || '';
    const messageId = ctx.message.message_id;

    // Deteksi duplikat berbasis CAPTION
    if (caption) {
        try {
            const [rows] = await db.execute(`
                SELECT id FROM albums 
                WHERE user_id = ? AND caption = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                LIMIT 1
            `, [userId, caption]);
            if (rows.length > 0) {
                return ctx.reply('⚠️ Media dengan caption serupa baru saja diunggah. Silakan cek menu Pending.');
            }
        } catch (e) {
            console.error('[DuplicateCheck] Error:', e);
        }
    }

    if (!albumCache.has(cacheKey)) {
        albumCache.set(cacheKey, {
            user_id: userId,
            chat_id: ctx.chat.id,
            message_ids: [],
            media_items: [],
            caption: caption,
            is_processed: false,
            timeout: setTimeout(async () => {
                await processAlbum(cacheKey, ctx);
            }, ALBUM_TIMEOUT)
        });
    }

    const album = albumCache.get(cacheKey);
    if (album.is_processed) return;
    
    // Batas 10 media
    if (album.message_ids.length >= 10) {
        if (album.message_ids.length === 10) {
            ctx.reply('⚠️ Maksimal 10 media per album.');
        }
        return;
    }

    album.message_ids.push(messageId);

    let type = '';
    let fileId = '';
    if (ctx.message.photo) {
        type = 'photo';
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.video) {
        type = 'video';
        fileId = ctx.message.video.file_id;
    } else if (ctx.message.document) {
        type = 'document';
        fileId = ctx.message.document.file_id;
    }

    if (type && fileId) {
        album.media_items.push({ type, media: fileId });
    }
    
    // Hanya set caption jika album belum punya caption (jangan overwrite)
    if (caption && !album.caption) {
        album.caption = caption;
    }

    // Refresh timeout
    clearTimeout(album.timeout);
    album.timeout = setTimeout(async () => {
        await processAlbum(cacheKey, ctx);
    }, ALBUM_TIMEOUT);
}

async function processAlbum(cacheKey, ctx) {
    const album = albumCache.get(cacheKey);
    if (!album || album.is_processed) return;
    
    // Start transaction to prevent race conditions
    let connection;
    try {
        if (album.timeout) clearTimeout(album.timeout);

        // Get connection for transaction
        connection = await db.getConnection();
        await connection.beginTransaction();

        const token = await generateUniqueToken(db);
         
        // Simpan album ke database
        const [result] = await connection.execute(`
            INSERT INTO albums (user_id, media_group_id, message_ids, media_items, chat_id, caption, unique_token, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            album.user_id, 
            cacheKey.split(':')[1],
            JSON.stringify(album.message_ids), 
            JSON.stringify(album.media_items),
            album.chat_id, 
            album.caption, 
            token,
            AlbumStatus.DRAFT
        ]);
 
        const albumId = result.insertId;
         
        // Mark as processed after successful insert
        album.is_processed = true;
         
        // Update album_count hanya untuk submitted albums (draft tidak dihitung)
        // await connection.execute(
        //     'UPDATE users SET album_count = (SELECT COUNT(*) FROM albums WHERE user_id = ? AND is_submitted = 1)', 
        //     [album.user_id]
        // );
 
        await connection.commit();
 
        await ctx.reply('✅ <b>Media berhasil diunggah!</b>\n\nSilakan buka <b>WebApp</b> dan cek menu <b>⏳ Pending</b> untuk melengkapi caption dan mengirimnya ke moderasi.', { parse_mode: 'HTML' });
 
    } catch (error) {
        // Rollback transaction if any error occurs
        if (connection) {
            await connection.rollback().catch(noop => {}); // Ignore rollback errors
        }
        console.error('[ProcessAlbum] Error:', error);
        await ctx.reply('❌ Gagal memproses album. Silakan coba kirim ulang.');
    } finally {
        // Release connection back to pool
        if (connection) {
            connection.release();
        }
        // Pembersihan Cache (Fix Bug 53)
        setTimeout(() => {
            albumCache.delete(cacheKey);
        }, 30000);
    }
}

// Fungsi bantuan untuk operasi noop
function noop() {}

async function handleSingleMedia(ctx) {
    const userId = ctx.from.id;
    const caption = ctx.message.caption || '';

    // Start transaction to prevent race conditions
    let connection;
    try {
        const token = await generateUniqueToken(db);
        
        let type = '';
        let fileId = '';
        if (ctx.message.photo) {
            type = 'photo';
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (ctx.message.video) {
            type = 'video';
            fileId = ctx.message.video.file_id;
        } else if (ctx.message.document) {
            type = 'document';
            fileId = ctx.message.document.file_id;
        } else if (ctx.message.animation) {
            type = 'animation';
            fileId = ctx.message.animation.file_id;
        } else if (ctx.message.audio) {
            type = 'audio';
            fileId = ctx.message.audio.file_id;
        }

        if (!type || !fileId) return;

        const mediaItems = [{ type, media: fileId }];

        // Get connection for transaction
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Simpan media ke database
        const [result] = await connection.execute(`
            INSERT INTO albums (user_id, media_group_id, message_ids, media_items, chat_id, caption, unique_token, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, null, JSON.stringify([ctx.message.message_id]), JSON.stringify(mediaItems), ctx.chat.id, caption, token, AlbumStatus.DRAFT]);

        const albumId = result.insertId;
        
        // Update album_count menggunakan query yang lebih aman
        await connection.execute(
            'UPDATE users SET album_count = (SELECT COUNT(*) FROM albums WHERE user_id = ? AND is_submitted = 1)', 
            [userId]
        );

        await connection.commit();

        await ctx.reply('✅ <b>Media berhasil diunggah!</b>\n\nSilakan cek menu <b>⏳ Pending</b> di WebApp untuk memproses media ini.', { parse_mode: 'HTML' });

    } catch (error) {
        // Rollback transaction if any error occurs
        if (connection) {
            await connection.rollback().catch(noop => {}); // Ignore rollback errors
        }
        console.error('[SingleMedia] Error:', error);
        await ctx.reply('❌ Gagal memproses media.');
    } finally {
        // Release connection back to pool
        if (connection) {
            connection.release();
        }
    }
}

module.exports = { handleAlbum, handleSingleMedia };
