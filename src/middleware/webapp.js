const { verifyWebAppInitData, parseInitData } = require('../helpers/webapp');

function webAppAuthMiddleware(req, res, next) {
    const authHeader = req.headers['x-telegram-init-data'];
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!verifyWebAppInitData(authHeader)) {
        return res.status(401).json({ error: 'Invalid authentication' });
    }

    const initData = parseInitData(authHeader);
    req.user = initData.user;
    next();
}

module.exports = { webAppAuthMiddleware };
