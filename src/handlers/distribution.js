const { Markup } = require('telegraf');
const db = require('../config/db');

async function handleStartWithToken(ctx) {
    const token = ctx.match[1];
    
    const [albums] = await db.execute(`
        SELECT a.*, u.username, u.first_name 
        FROM albums a
        JOIN users u ON a.user_id = u.user_id
        WHERE unique_token = ? AND status = 'approved'
    `, [token]);

    if (albums.length === 0) {
        return ctx.reply('❌ Link tidak valid atau album sudah dihapus.');
    }

    const album = albums[0];
    const mediaItems = JSON.parse(album.media_items || '[]');

    try {
        if (mediaItems && mediaItems.length > 0) {
            // Sisipkan caption pada media pertama agar muncul saat dikirim sebagai album
            if (album.caption) {
                mediaItems[0].caption = album.caption;
            }
            // Data baru: Kirim sebagai Media Group
            await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaItems);
        } else {
            // Data lama: Fallback kirim satu per satu agar caption tetap muncul di media pertama
            const messageIds = JSON.parse(album.message_ids || '[]');
            for (let i = 0; i < messageIds.length; i++) {
                const options = {};
                // Tambahkan caption hanya pada media pertama (seperti perilaku album)
                if (i === 0 && album.caption) {
                    options.caption = album.caption;
                }
                
                await ctx.telegram.copyMessage(
                    ctx.chat.id,
                    album.chat_id,
                    messageIds[i],
                    options
                );
            }
        }

        // Update statistik jumlah unduhan (Unique Download: Hanya naikkan jika user baru pertama kali download album ini)
        try {
            await db.execute('INSERT INTO downloads (album_id, user_id) VALUES (?, ?)', [album.id, ctx.from.id]);
            // Jika insert berhasil (user baru untuk album ini), naikkan counter di tabel albums & users
            await db.execute('UPDATE albums SET download_count = download_count + 1 WHERE id = ?', [album.id]);
            await db.execute('UPDATE users SET download_count = download_count + 1 WHERE user_id = ?', [ctx.from.id]);
        } catch (e) {
            // Jika e.errno !== 1062 (Duplicate entry), berarti ada error database beneran
            if (e.errno !== 1062) console.error('[Download] Database error:', e.message);
            // Jika errno === 1062, abaikan saja karena itu berarti user sudah pernah download sebelumnya
        }

        // Log aktivitas
        await db.execute(`
            INSERT INTO activity_logs (action, user_id, target_id, details)
            VALUES ('download', ?, ?, ?)
        `, [ctx.from.id, album.id, `Download album ${album.id}`]);

        // Cek apakah user sudah pernah rate album ini
        const [existingRating] = await db.execute(
            'SELECT id FROM ratings WHERE album_id = ? AND user_id = ?',
            [album.id, ctx.from.id]
        );

        if (existingRating.length === 0) {
            // Tampilkan tombol rating
            const ratingKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('⭐', `rate_${album.id}_1`),
                    Markup.button.callback('⭐⭐', `rate_${album.id}_2`),
                    Markup.button.callback('⭐⭐⭐', `rate_${album.id}_3`),
                    Markup.button.callback('⭐⭐⭐⭐', `rate_${album.id}_4`),
                    Markup.button.callback('⭐⭐⭐⭐⭐', `rate_${album.id}_5`)
                ]
            ]);

            await ctx.reply(
                '✅ Album berhasil dikirim!\n\nSilahkan berikan rating untuk album ini:',
                ratingKeyboard
            );
        }

    } catch (error) {
        console.error('Copy message error:', error);
        await ctx.reply('❌ Gagal mengirim album. Silahkan coba lagi nanti.');
    }
}

async function handleRating(ctx) {
    const albumId = ctx.match[1];
    const rating = parseInt(ctx.match[2]);

    if (rating < 1 || rating > 5) {
        return ctx.answerCbQuery('Rating tidak valid', true);
    }

    // Cek apakah user sudah pernah rate
    const [existingRating] = await db.execute(
        'SELECT id FROM ratings WHERE album_id = ? AND user_id = ?',
        [albumId, ctx.from.id]
    );

    if (existingRating.length > 0) {
        return ctx.answerCbQuery('Anda sudah memberikan rating untuk album ini', true);
    }

    try {
        // Ambil data album saat ini untuk kalkulasi atomik
        const [albumRows] = await db.execute(
            'SELECT channel_message_id, unique_token, rating_count, rating_total, download_count FROM albums WHERE id = ?', 
            [albumId]
        );
        
        if (albumRows.length === 0) {
            return ctx.answerCbQuery('Album tidak ditemukan', true);
        }
        
        const album = albumRows[0];

        // PROTEKSI: Tidak boleh memberikan rating pada album sendiri
        if (album.user_id == ctx.from.id) {
            return ctx.answerCbQuery('⚠️ Anda tidak bisa memberikan rating pada karya sendiri.', true);
        }

        // Simpan rating baru
        await db.execute(`
            INSERT INTO ratings (album_id, user_id, rating)
            VALUES (?, ?, ?)
        `, [albumId, ctx.from.id, rating]);

        // UPDATE ATOMIK: Menghitung statistik baru langsung di database untuk mencegah Race Condition
        await db.execute(`
            UPDATE albums 
            SET 
                rating_count = rating_count + 1, 
                rating_total = rating_total + ?,
                rating_avg = ROUND((rating_total + ?) / (rating_count + 1), 2)
            WHERE id = ?
        `, [rating, rating, albumId]);

        // Ambil data terbaru untuk sinkronisasi pesan publik
        const [updatedAlbum] = await db.execute(
            'SELECT rating_avg, rating_count, download_count FROM albums WHERE id = ?',
            [albumId]
        );
        const newStats = updatedAlbum[0];

        // SINKRONISASI: Update info rating di pesan channel publik
        if (album.channel_message_id) {
            const botUsername = process.env.BOT_USERNAME.replace('@', '');
            const link = `https://t.me/${botUsername}?start=${album.unique_token}`;
            
            try {
                await ctx.telegram.editMessageText(
                    process.env.PUBLIC_CHANNEL_ID,
                    album.channel_message_id,
                    null,
                    `📢 Album Baru Tersedia!\n\n⭐ Rating: ${newStats.rating_avg} (${newStats.rating_count} rating)\n📥 Jumlah unduhan: ${newStats.download_count || 0}\n\nKlik link untuk mendapatkan album:\n${link}`,
                    {
                        ...Markup.inlineKeyboard([
                            Markup.button.url('📥 Dapatkan Album', link)
                        ])
                    }
                );
            } catch (editError) {
                console.error('[UpdateRating] Gagal sinkronisasi pesan channel:', editError.message);
            }
        }

        // Berikan feedback ke user
        await ctx.editMessageText(`Terima kasih! Anda memberikan rating ${'⭐'.repeat(rating)} untuk album ini.`);
        await ctx.answerCbQuery('Rating berhasil disimpan!');

    } catch (error) {
        console.error('Rating error:', error);
        await ctx.answerCbQuery('Gagal menyimpan rating', true);
    }
}

module.exports = { handleStartWithToken, handleRating };
