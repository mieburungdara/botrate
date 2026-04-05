const crypto = require('crypto');

function verifyWebAppInitData(initData) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(process.env.BOT_TOKEN)
        .digest();

    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

function parseInitData(initData) {
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user') || '{}');
    return {
        user,
        authDate: parseInt(params.get('auth_date')),
        hash: params.get('hash'),
        queryId: params.get('query_id')
    };
}

module.exports = { verifyWebAppInitData, parseInitData };
