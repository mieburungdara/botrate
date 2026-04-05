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
    const messageIds = JSON.parse(album.message_ids);

    try {
        await ctx.telegram.copyMessages(
            ctx.chat.id,
            album.chat_id,
            messageIds,
            { caption: album.caption }
        );

        // Update download counter
        await db.execute('UPDATE albums SET download_count = download_count + 1 WHERE id = ?', [album.id]);
        await db.execute('UPDATE users SET download_count = download_count + 1 WHERE user_id = ?', [ctx.from.id]);

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
        // Simpan rating
        await db.execute(`
            INSERT INTO ratings (album_id, user_id, rating)
            VALUES (?, ?, ?)
        `, [albumId, ctx.from.id, rating]);

        // Update statistik album
        await db.execute(`
            UPDATE albums 
            SET 
                rating_count = rating_count + 1,
                rating_total = rating_total + ?,
                rating_avg = ROUND((rating_total + ?) / (rating_count + 1), 2)
            WHERE id = ?
        `, [rating, rating, albumId]);

        // Edit pesan rating
        await ctx.editMessageText(`Terima kasih! Anda memberikan rating ${'⭐'.repeat(rating)} untuk album ini.`);
        await ctx.answerCbQuery('Rating berhasil disimpan!');

    } catch (error) {
        console.error('Rating error:', error);
        await ctx.answerCbQuery('Gagal menyimpan rating', true);
    }
}

module.exports = { handleStartWithToken, handleRating };
