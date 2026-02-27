const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { initStorage } = require('./src/storage');
const authRoutes = require('./src/auth');
const serverRoutes = require('./src/servers');
const { authMiddleware } = require('./src/middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全头
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(express.json({ limit: '1mb' }));

// 路由
app.use('/auth', authRoutes);
app.use('/api', authMiddleware, serverRoutes);

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 全局错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});

// 启动
initStorage().then(() => {
    app.listen(PORT, () => {
        console.log(`探针系统已启动: http://localhost:${PORT}`);
        console.log('默认账号: admin / probe123');
    });
}).catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});
