const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

let data = null;

async function initStorage() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        const raw = await fs.readFile(DATA_FILE, 'utf-8');
        data = JSON.parse(raw);
        if (!data.user || !data.jwtSecret) throw new Error('数据结构异常');
    } catch (err) {
        if (err.code === 'ENOENT' || err.message === '数据结构异常') {
            const hash = await bcrypt.hash('probe123', 10);
            data = {
                jwtSecret: crypto.randomBytes(64).toString('hex'),
                user: { username: 'admin', password: hash },
                servers: []
            };
            await save();
        } else {
            throw err;
        }
    }
}

async function save() {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getData() {
    return data;
}

async function updatePassword(hash) {
    data.user.password = hash;
    data.jwtSecret = crypto.randomBytes(64).toString('hex');
    await save();
}

async function addServer(server) {
    data.servers.push(server);
    await save();
}

async function removeServer(id) {
    data.servers = data.servers.filter(s => s.id !== id);
    await save();
}

module.exports = { initStorage, getData, updatePassword, addServer, removeServer };
