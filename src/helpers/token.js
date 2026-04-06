const crypto = require('crypto');

/**
 * Menghasilkan token acak dengan panjang tertentu
 * @param {number} length - Panjang token (hex)
 * @returns {string} Token acak
 */
function generateToken(length = 32) {
    return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Validasi nama tabel dan kolom untuk mencegah SQL Injection
 * @param {string} input - String yang akan divalidasi
 * @param {string[]} allowedValues - Daftar nilai yang diizinkan
 * @returns {boolean} True jika valid
 */
function validateIdentifier(input, allowedValues) {
    return allowedValues.includes(input);
}

/**
 * Menghasilkan token unik dengan memastikan tidak ada tabrakan di database (Fix Bug 28)
 * @param {object} db - Koneksi/Pool database
 * @param {string} table - Nama tabel (default: albums)
 * @param {string} column - Nama kolom (default: unique_token)
 * @returns {Promise<string>} Token unik yang belum pernah digunakan
 */
async function generateUniqueToken(db, table = 'albums', column = 'unique_token') {
    // Validasi table dan column untuk mencegah SQL Injection
    const allowedTables = ['albums'];
    const allowedColumns = ['unique_token'];
    
    if (!validateIdentifier(table, allowedTables) || !validateIdentifier(column, allowedColumns)) {
        throw new Error('Invalid table or column name');
    }

    let token;
    let isUnique = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // Batas aman yang sangat tinggi

    while (!isUnique && attempts < MAX_ATTEMPTS) {
        // Gunakan token 32 karakter (hex) sebagai standar
        token = generateToken(32);
        
        const [rows] = await db.execute(
            `SELECT id FROM ${table} WHERE ${column} = ? LIMIT 1`, 
            [token]
        );
        
        if (rows.length === 0) {
            isUnique = true;
        } else {
            console.warn(`[Token:Collision] Tabrakan terdeteksi pada upaya ke-${attempts + 1}. Mencoba ulang...`);
            attempts++;
        }
    }

    if (!isUnique) {
        // Upaya terakhir dengan entropi super tinggi (64 hex characters)
        token = generateToken(64);
        console.warn('[Token:HighEntropy] Menggunakan token entropi tinggi sebagai upaya keamanan terakhir.');
    }

    return token;
}

module.exports = { generateToken, generateUniqueToken };
