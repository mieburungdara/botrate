const crypto = require('crypto');

function generateToken(length = 32) {
    return crypto.randomBytes(length / 2).toString('hex');
}

module.exports = { generateToken };
