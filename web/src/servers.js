const express = require('express');
const crypto = require('crypto');
const { getData, addServer, removeServer } = require('./storage');

const router = express.Router();

// 获取服务器列表（不暴露 URL）
router.get('/servers', (req, res) => {
    const servers = getData().servers.map(({ id, name, addedAt }) => ({ id, name, addedAt }));
    res.json(servers);
});

// 添加服务器
router.post('/servers', async (req, res) => {
    try {
        const { name, url } = req.body;
        if (!name || !url) {
            return res.status(400).json({ error: '请输入服务器名称和API地址' });
        }
        try { new URL(url); } catch {
            return res.status(400).json({ error: 'API地址格式无效' });
        }

        const server = {
            id: crypto.randomUUID(),
            name: name.trim(),
            url: url.trim(),
            addedAt: new Date().toISOString()
        };
        await addServer(server);
        res.json({ id: server.id, name: server.name, addedAt: server.addedAt });
    } catch (err) {
        res.status(500).json({ error: '添加失败' });
    }
});

// 删除服务器
router.delete('/servers/:id', async (req, res) => {
    try {
        const server = getData().servers.find(s => s.id === req.params.id);
        if (!server) return res.status(404).json({ error: '服务器不存在' });
        await removeServer(req.params.id);
        res.json({ message: '删除成功' });
    } catch (err) {
        res.status(500).json({ error: '删除失败' });
    }
});

// 代理获取监控指标
router.get('/servers/:id/metrics', async (req, res) => {
    const server = getData().servers.find(s => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: '服务器不存在' });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(server.url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch {
        res.status(502).json({ error: '无法连接到服务器', status: '离线' });
    }
});

module.exports = router;
