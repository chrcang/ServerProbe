const express = require('express');
const crypto = require('crypto');
const { getData, addServer, removeServer } = require('./storage');

const router = express.Router();

function normalizeExpiresAt(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);
        const date = new Date(year, month - 1, day);
        if (
            date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day
        ) {
            return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        }
        return null;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

// 获取服务器列表（不暴露 URL）
router.get('/servers', (req, res) => {
    const servers = getData().servers.map(({ id, name, addedAt, expiresAt }) => ({
        id,
        name,
        addedAt,
        expiresAt: normalizeExpiresAt(expiresAt)
    }));
    res.json(servers);
});

// 添加服务器
router.post('/servers', async (req, res) => {
    try {
        const { name, url, expiresAt } = req.body;
        if (!name || !url) {
            return res.status(400).json({ error: '请输入服务器名称和API地址' });
        }
        try { new URL(url); } catch {
            return res.status(400).json({ error: 'API地址格式无效' });
        }

        let normalizedExpiresAt = null;
        if (typeof expiresAt === 'string') {
            const trimmedExpiresAt = expiresAt.trim();
            if (trimmedExpiresAt) {
                normalizedExpiresAt = normalizeExpiresAt(trimmedExpiresAt);
                if (!normalizedExpiresAt) {
                    return res.status(400).json({ error: '到期日期格式无效' });
                }
            }
        } else if (expiresAt !== undefined && expiresAt !== null) {
            return res.status(400).json({ error: '到期日期格式无效' });
        }

        const server = {
            id: crypto.randomUUID(),
            name: name.trim(),
            url: url.trim(),
            addedAt: new Date().toISOString(),
            expiresAt: normalizedExpiresAt
        };
        await addServer(server);
        res.json({
            id: server.id,
            name: server.name,
            addedAt: server.addedAt,
            expiresAt: server.expiresAt
        });
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
