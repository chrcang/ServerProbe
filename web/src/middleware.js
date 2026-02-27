const jwt = require('jsonwebtoken');
const { getData } = require('./storage');

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未授权' });
    }
    try {
        req.user = jwt.verify(header.slice(7), getData().jwtSecret);
        next();
    } catch {
        return res.status(401).json({ error: '令牌无效或已过期' });
    }
}

module.exports = { authMiddleware };
