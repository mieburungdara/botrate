const { Markup } = require('telegraf');
const db = require('../config/db');

async function handleStartWithToken(ctx) {
    const token = ctx.match[1];
    
    try {
        const [albums] = await db.execute(`
            SELECT a.*, u.anonymous_id, u.is_public
            FROM albums a
            JOIN users u ON a.user_id = u.user_id
            WHERE unique_token = ? AND status = 'approved'
        `, [token]);

        if (albums.length === 0) {
            return ctx.reply('❌ Link tidak valid atau media sudah dihapus.');
        }

        const album = albums[0];
        let mediaItems = [];
        try {
            mediaItems = JSON.parse(album.media_items || '[]');
        } catch (e) {
            console.error('[Distribution] JSON Parse error media_items:', e.message);
            mediaItems = [];
        }

        // Function to escape HTML special characters
        const escapeHtml = (text) => {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // Sembunyikan ID Anonim jika mode private aktif
        const contributor = album.is_public ? (album.anonymous_id || "Kreator") : "Kreator";
        const escapedCaption = escapeHtml(album.caption || '');
        const escapedContributor = escapeHtml(contributor);
        const fullCaption = `${escapedCaption}\n\n👤 <b>Kontribusi:</b> ${escapedContributor}`;

        if (mediaItems && mediaItems.length > 0) {
            // PROTEKSI: Telegram sendMediaGroup hanya mendukung campuran Photo & Video. 
            // Document tidak bisa dicampur. Kita filter di sini sebagai langkah pengamanan terakhir.
            const visualMedia = mediaItems.filter(item => item.type === 'photo' || item.type === 'video');
            const documents = mediaItems.filter(item => item.type === 'document');

            // Kirim Galeri Foto/Video jika ada
            if (visualMedia.length > 0) {
                // Sisipkan caption pada media pertama di galeri visual
                visualMedia[0].caption = fullCaption;
                visualMedia[0].parse_mode = 'HTML';
                
                await ctx.telegram.sendMediaGroup(ctx.chat.id, visualMedia);
            }

            // Function to escape HTML special characters
            const escapeHtml = (text) => {
                if (!text) return '';
                return String(text)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };

            // Kirim Dokumen secara terpisah jika ada (Karena tidak bisa di-group dengan foto/video)
            if (documents.length > 0) {
                for (let i = 0; i < documents.length; i++) {
                    const docOptions = { parse_mode: 'HTML' };
                    // Jika tidak ada visual media, kirim caption di dokumen pertama
                    if (visualMedia.length === 0 && i === 0) {
                        docOptions.caption = fullCaption; // fullCaption is already escaped
                    }
                    await ctx.telegram.sendDocument(ctx.chat.id, documents[i].media, docOptions);
                }
            }
        } else {
            // Fallback untuk data lama atau pesan tunggal via message_ids
            let messageIds = [];
            try { messageIds = JSON.parse(album.message_ids || '[]'); } catch (e) { messageIds = []; }
            
            if (messageIds.length === 0) {
                return ctx.reply('⚠️ Maaf, data media ini tidak dapat dibaca. Silahkan hubungi admin.');
            }

            for (let i = 0; i < messageIds.length; i++) {
                const options = { parse_mode: 'HTML' };
                if (i === 0) options.caption = fullCaption;
                
                await ctx.telegram.copyMessage(ctx.chat.id, album.chat_id, messageIds[i], options);
            }
        }

        // --- SISTEM STATISTIK UNDUHAN (Fix Bug 25) ---
        try {
            // Pastikan user tercatat di tabel downloads (Mencegah double count)
            await db.execute('INSERT IGNORE INTO downloads (album_id, user_id) VALUES (?, ?)', [album.id, ctx.from.id]);
            
            // Rekalkulasi download_count agar akurat
            const [dlCount] = await db.execute('SELECT COUNT(*) as total FROM downloads WHERE album_id = ?', [album.id]);
            await db.execute('UPDATE albums SET download_count = ? WHERE id = ?', [dlCount[0].total, album.id]);
            
            // Update counter global user pengunduh
            await db.execute('UPDATE users SET download_count = download_count + 1 WHERE user_id = ?', [ctx.from.id]);
        } catch (e) {
            console.error('[DownloadStats] Error:', e.message);
        }

        // Tampilkan Rating Keyboard
        const [existingRating] = await db.execute(
            'SELECT id FROM ratings WHERE album_id = ? AND user_id = ?',
            [album.id, ctx.from.id]
        );

        if (existingRating.length === 0) {
            await ctx.reply(
                '✅ Media berhasil dikirim!\n\nSilahkan berikan rating untuk media ini:',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('⭐', `rate_${album.id}_1`),
                        Markup.button.callback('⭐⭐', `rate_${album.id}_2`),
                        Markup.button.callback('⭐⭐⭐', `rate_${album.id}_3`),
                        Markup.button.callback('⭐⭐⭐⭐', `rate_${album.id}_4`),
                        Markup.button.callback('⭐⭐⭐⭐⭐', `rate_${album.id}_5`)
                    ]
                ])
            );
        }

    } catch (error) {
        console.error('[Distribution] General Error:', error);
        await ctx.reply('❌ Terjadi kesalahan sistem saat mengambil media. Silahkan lapor ke admin.');
    }
}

async function handleRating(ctx) {
    const albumId = ctx.match[1];
    const rating = parseInt(ctx.match[2]);

    if (isNaN(rating) || rating < 1 || rating > 5) {
        return ctx.answerCbQuery('Rating tidak valid', true);
    }

    try {
        const [albumRows] = await db.execute(
            'SELECT user_id, channel_message_id, unique_token, rating_count, rating_total FROM albums WHERE id = ?', 
            [albumId]
        );
        
        if (albumRows.length === 0) return ctx.answerCbQuery('Media tidak ditemukan', true);
        const album = albumRows[0];

        if (album.user_id == ctx.from.id) {
            return ctx.answerCbQuery('⚠️ Anda tidak bisa memberikan rating pada karya sendiri.', true);
        }

        const [existingRating] = await db.execute(
            'SELECT id FROM ratings WHERE album_id = ? AND user_id = ?',
            [albumId, ctx.from.id]
        );

        if (existingRating.length > 0) {
            return ctx.answerCbQuery('Anda sudah memberikan rating sebelumnya.', true);
        }

        // Gunakan INSERT IGNORE untuk mencegah duplikasi secara aman (Fix Bug 81)
        const [insertResult] = await db.execute(
            'INSERT IGNORE INTO ratings (album_id, user_id, rating) VALUES (?, ?, ?)', 
            [albumId, ctx.from.id, rating]
        );
        
        // Hanya update statistik jika ini adalah rating baru (bukan duplikat yang diabaikan)
        if (insertResult.affectedRows > 0) {
            await db.execute(`
                UPDATE albums SET 
                    rating_count = rating_count + 1, 
                    rating_total = rating_total + ?,
                    rating_avg = ROUND((rating_total + ?) / (rating_count + 1), 2)
                WHERE id = ?
            `, [rating, rating, albumId]);

        // Sync ke Channel (Tampilkan statistik terbaru)
        if (album.channel_message_id && process.env.PUBLIC_CHANNEL_ID) {
            const [updated] = await db.execute('SELECT rating_avg, rating_count, download_count FROM albums WHERE id = ?', [albumId]);
            const s = updated[0];
            const botUsername = ctx.botInfo?.username || process.env.BOT_USERNAME.replace('@', '') || 'unknown_bot';
            const link = `https://t.me/${botUsername}?start=${album.unique_token}`;
            
            try {
                await ctx.telegram.editMessageText(
                    process.env.PUBLIC_CHANNEL_ID,
                    album.channel_message_id,
                    null,
                    `📢 Media Baru Tersedia!\n\n⭐ Rating: ${s.rating_avg} (${s.rating_count} rating)\n📥 Jumlah unduhan: ${s.download_count || 0}\n\nKlik link untuk mendapatkan media:\n${link}`,
                    Markup.inlineKeyboard([Markup.button.url('📥 Dapatkan Media', link)])
                ).catch(() => {}); // Abaikan jika konten sama (identical)
            } catch (e) {
                // Ignore error if message is identical or other non-critical issues
            }
        } else if (album.channel_message_id && !process.env.PUBLIC_CHANNEL_ID) {
            console.warn('[Rating] PUBLIC_CHANNEL_ID is not set, skipping channel update');
        }
        } else {
            return ctx.answerCbQuery('Anda sudah memberikan rating untuk media ini.', true);
        }

        await ctx.editMessageText(`Terima kasih! Anda memberikan rating ${'⭐'.repeat(rating)}.`);
        await ctx.answerCbQuery('Rating berhasil!');

    } catch (error) {
        console.error('[Rating] Error:', error);
        await ctx.answerCbQuery('Gagal menyimpan rating', true);
    }
}

module.exports = { handleStartWithToken, handleRating };
