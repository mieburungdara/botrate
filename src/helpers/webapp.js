const crypto = require('crypto');

/**
 * Memverifikasi validitas data inisialisasi dari Telegram WebApp (Fix Bug 40, 41)
 * @param {string} initData - initData mentah dari bot.Telegram.WebApp.initData
 * @returns {boolean} True jika data valid
 */
function verifyWebAppInitData(initData) {
    if (!initData) return false;

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        
        if (!hash) {
            console.error('[WebAppAuth] Hash missing in initData');
            return false;
        }

        // Hapus hash untuk pengecekan data
        params.delete('hash');

        // PENTING: Sorting harus Lexicographical (Fix Bug 41)
        // Gunakan perbandingan biner murni, jangan localeCompare
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => {
                if (a < b) return -1;
                if (a > b) return 1;
                return 0;
            })
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(process.env.BOT_TOKEN || '')
            .digest();

        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        // Gunakan buffer untuk timingSafeEqual (Fix Bug 90)
        const hashBuffer = Buffer.from(hash, 'hex');
        const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

        if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
            console.warn('[WebAppAuth] Invalid Hash detected (Timing Safe). Potential data tampering.');
            return false;
        }

        // Replay Attack protection: 24 jam limit
        const authDate = parseInt(params.get('auth_date'));
        const now = Math.floor(Date.now() / 1000);
        
        if (isNaN(authDate) || (now - authDate) > 86400) {
            console.warn(`[WebAppAuth] Data expired or missing auth_date. AuthDate: ${authDate}, Current: ${now}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[WebAppAuth] Unexpected error during verification:', error.message);
        return false;
    }
}

/**
 * Mem-parse initData menjadi objek data user
 * @param {string} initData 
 * @returns {object} Data terurai
 */
function parseInitData(initData) {
    try {
        const params = new URLSearchParams(initData);
        const user = JSON.parse(params.get('user') || '{}');
        return {
            user,
            authDate: parseInt(params.get('auth_date')),
            hash: params.get('hash'),
            queryId: params.get('query_id')
        };
    } catch (e) {
        return { user: {} };
    }
}

module.exports = { verifyWebAppInitData, parseInitData };
