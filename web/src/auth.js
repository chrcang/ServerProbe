const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getData, updatePassword } = require('./storage');
const { authMiddleware } = require('./middleware');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: '登录尝试过于频繁，请稍后再试' }
});

// 登录
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }

        const { user, jwtSecret } = getData();
        if (username !== user.username || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const token = jwt.sign({ username }, jwtSecret, { expiresIn: '24h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: '登录失败' });
    }
});

// 修改密码
router.post('/password', authMiddleware, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '请输入旧密码和新密码' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }

        const { user } = getData();
        if (!(await bcrypt.compare(oldPassword, user.password))) {
            return res.status(401).json({ error: '旧密码错误' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await updatePassword(hash);
        res.json({ message: '密码修改成功' });
    } catch (err) {
        res.status(500).json({ error: '操作失败' });
    }
});

module.exports = router;
