(function () {
    var token = localStorage.getItem('token');
    if (!token) { window.location.href = '/login.html'; return; }

    // ── 工具函数 ──
    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s || '--';
        return d.innerHTML;
    }

    function formatBytes(b) {
        if (!b || b === 0) return '0 B';
        var u = ['B', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(b) / Math.log(1024));
        return (b / Math.pow(1024, i)).toFixed(2) + ' ' + u[i];
    }

    function formatSpeed(b) { return formatBytes(b) + '/s'; }

    function perfLevel(v) {
        if (v >= 80) return 'perf-high';
        if (v >= 60) return 'perf-mid';
        return 'perf-low';
    }

    // ── API 请求封装 ──
    function api(url, opts) {
        opts = opts || {};
        opts.headers = Object.assign({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }, opts.headers || {});
        return fetch(url, opts).then(function (res) {
            if (res.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                throw new Error('未授权');
            }
            return res.json().then(function (d) {
                if (!res.ok) throw new Error(d.error || '请求失败');
                return d;
            });
        });
    }

    // ── 状态 ──
    var servers = [];
    var metrics = {};
    var refreshId = null;
    var currentFilter = 'all'; // 'all' | 'online' | 'offline'

    // ── DOM ──
    var gridEl = document.getElementById('serverGrid');
    var emptyEl = document.getElementById('emptyState');

    // ── 加载服务器列表 ──
    function loadServers() {
        return api('/api/servers').then(function (list) {
            servers = list;
            render();
            return refreshMetrics();
        });
    }

    // ── 刷新所有指标 ──
    function refreshMetrics() {
        var tasks = servers.map(function (s) {
            return api('/api/servers/' + s.id + '/metrics')
                .then(function (d) { metrics[s.id] = d; })
                .catch(function () { metrics[s.id] = { status: '离线' }; });
        });
        return Promise.all(tasks).then(updateCards);
    }

    // ── 渲染卡片骨架 ──
    function render() {
        if (servers.length === 0) {
            gridEl.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }
        emptyEl.classList.add('hidden');

        gridEl.innerHTML = servers.map(function (s) {
            return '<div class="server-card" id="card-' + s.id + '">'
                + '<div class="card-header">'
                +   '<h3><i class="ri-server-line"></i>' + esc(s.name) + '</h3>'
                +   '<span class="status-badge status-loading">连接中</span>'
                + '</div>'
                + '<div class="card-body">'
                +   '<div class="info-tags"><span class="tag">--</span></div>'
                +   '<div class="info-details"><div class="info-detail">--</div></div>'
                +   '<div class="perf-section">'
                +     perfBarHtml('CPU', 'cpu', 0, '')
                +     perfBarHtml('内存', 'mem', 0, '')
                +     perfBarHtml('磁盘', 'disk', 0, '')
                +   '</div>'
                +   '<div class="net-section">'
                +     netItemHtml('↑ 上传', '--') + netItemHtml('↓ 下载', '--')
                +     netItemHtml('↑ 总计', '--') + netItemHtml('↓ 总计', '--')
                +   '</div>'
                + '</div>'
                + '<div class="card-footer">'
                +   '<button class="btn btn-danger" data-id="' + s.id + '"><i class="ri-delete-bin-line"></i>删除</button>'
                + '</div>'
                + '</div>';
        }).join('');

        // 绑定删除事件
        gridEl.querySelectorAll('.btn-danger').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                var srv = servers.find(function (s) { return s.id === id; });
                if (!srv) return;
                if (!confirm('确定删除「' + srv.name + '」吗？')) return;
                api('/api/servers/' + id, { method: 'DELETE' }).then(function () {
                    delete metrics[id];
                    loadServers();
                }).catch(function (e) { alert(e.message); });
            });
        });
    }

    function perfBarHtml(name, key, pct, detail) {
        var v = (pct || 0).toFixed(1);
        var label = detail ? v + '% (' + detail + ')' : v + '%';
        return '<div class="perf-item" data-perf="' + key + '">'
            + '<div class="perf-label"><span class="perf-label-name">' + name + '</span>'
            + '<span class="perf-label-value">' + label + '</span></div>'
            + '<div class="perf-bar"><div class="perf-fill ' + perfLevel(pct || 0)
            + '" style="width:' + (pct || 0) + '%"></div></div></div>';
    }

    function updatePerfBar(card, key, pct, detail) {
        var item = card.querySelector('.perf-item[data-perf="' + key + '"]');
        if (!item) return;
        var v = (pct || 0).toFixed(1);
        var label = detail ? v + '% (' + detail + ')' : v + '%';
        item.querySelector('.perf-label-value').textContent = label;
        var fill = item.querySelector('.perf-fill');
        fill.style.width = (pct || 0) + '%';
        fill.className = 'perf-fill ' + perfLevel(pct || 0);
    }

    function netItemHtml(label, value) {
        return '<div class="net-item"><div class="net-label">' + label
            + '</div><div class="net-value">' + value + '</div></div>';
    }

    // ── 筛选显示 ──
    function applyFilter() {
        servers.forEach(function (s) {
            var card = document.getElementById('card-' + s.id);
            if (!card) return;
            var m = metrics[s.id];
            var isOnline = m && m.status !== '离线';

            if (currentFilter === 'all') {
                card.style.display = '';
            } else if (currentFilter === 'online') {
                card.style.display = isOnline ? '' : 'none';
            } else {
                card.style.display = isOnline ? 'none' : '';
            }
        });
    }

    function setFilter(filter) {
        currentFilter = filter;
        // 更新选中态
        document.querySelectorAll('.stat-item').forEach(function (el) {
            el.classList.toggle('stat-active', el.getAttribute('data-filter') === filter);
        });
        applyFilter();
    }

    // ── 更新统计 ──
    function updateStats() {
        var total = servers.length;
        var online = 0;
        servers.forEach(function (s) {
            var m = metrics[s.id];
            if (m && m.status !== '离线') online++;
        });
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statOnline').textContent = online;
        document.getElementById('statOffline').textContent = total - online;
        applyFilter();
    }

    // ── 更新卡片数据 ──
    function updateCards() {
        updateStats();
        servers.forEach(function (s) {
            var m = metrics[s.id];
            var card = document.getElementById('card-' + s.id);
            if (!card || !m) return;

            var badge = card.querySelector('.status-badge');

            if (m.status === '离线') {
                badge.className = 'status-badge status-offline';
                badge.textContent = '离线';
                card.style.opacity = '0.6';
                return;
            }

            card.style.opacity = '1';
            badge.className = 'status-badge status-online';
            badge.textContent = '在线';

            // 系统信息
            var tagsEl = card.querySelector('.info-tags');
            tagsEl.innerHTML = [m.system, m.arch, m.region].filter(Boolean)
                .map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');

            var detailsEl = card.querySelector('.info-details');
            detailsEl.innerHTML = '';
            var lines = [];
            if (m.uptime) lines.push('运行 ' + m.uptime);
            if (m.cpuInfo) lines.push(m.cpuInfo);
            if (m.load) lines.push('负载 ' + m.load);
            lines.forEach(function (text) {
                var div = document.createElement('div');
                div.className = 'info-detail';
                div.textContent = text;
                detailsEl.appendChild(div);
            });

            // 进度条
            var memDetail = formatBytes(m.memUsed) + ' / ' + formatBytes(m.memTotal);
            var diskDetail = formatBytes(m.diskUsed) + ' / ' + formatBytes(m.diskTotal);
            updatePerfBar(card, 'cpu', m.cpuUsage, '');
            updatePerfBar(card, 'mem', m.memUsage, memDetail);
            updatePerfBar(card, 'disk', m.diskUsage, diskDetail);

            // 网络
            var netEl = card.querySelector('.net-section');
            netEl.innerHTML = netItemHtml('↑ 上传速度', formatSpeed(m.uploadSpeed))
                + netItemHtml('↓ 下载速度', formatSpeed(m.downloadSpeed))
                + netItemHtml('↑ 总上传', formatBytes(m.totalUpload))
                + netItemHtml('↓ 总下载', formatBytes(m.totalDownload));
        });
    }

    // ── 自动刷新 ──
    function scheduleRefresh() {
        refreshId = setTimeout(function () {
            refreshMetrics().then(scheduleRefresh);
        }, 2000);
    }

    // 页面可见性切换
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            clearTimeout(refreshId);
        } else {
            refreshMetrics().then(scheduleRefresh);
        }
    });

    // ── 模态框控制 ──
    function openModal(id) {
        document.getElementById(id).classList.remove('hidden');
    }
    function closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    }

    // 点击遮罩关闭
    document.querySelectorAll('.modal-overlay').forEach(function (el) {
        el.addEventListener('click', function () {
            this.parentElement.classList.add('hidden');
        });
    });
    document.querySelectorAll('.modal-cancel').forEach(function (el) {
        el.addEventListener('click', function () {
            this.closest('.modal').classList.add('hidden');
        });
    });

    // ── 添加服务器 ──
    document.getElementById('btnAdd').addEventListener('click', function () {
        document.getElementById('addForm').reset();
        document.getElementById('addError').classList.add('hidden');
        openModal('addModal');
    });

    document.getElementById('addForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var errEl = document.getElementById('addError');
        errEl.classList.add('hidden');

        var name = document.getElementById('serverName').value.trim();
        var url = document.getElementById('serverUrl').value.trim();

        api('/api/servers', {
            method: 'POST',
            body: JSON.stringify({ name: name, url: url })
        }).then(function () {
            closeModal('addModal');
            loadServers();
        }).catch(function (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        });
    });

    // ── 修改密码 ──
    document.getElementById('btnPassword').addEventListener('click', function () {
        document.getElementById('pwdForm').reset();
        document.getElementById('pwdError').classList.add('hidden');
        openModal('pwdModal');
    });

    document.getElementById('pwdForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var errEl = document.getElementById('pwdError');
        errEl.classList.add('hidden');

        var oldPwd = document.getElementById('oldPwd').value;
        var newPwd = document.getElementById('newPwd').value;
        var confirm = document.getElementById('confirmPwd').value;

        if (newPwd !== confirm) {
            errEl.textContent = '两次输入的密码不一致';
            errEl.classList.remove('hidden');
            return;
        }

        api('/auth/password', {
            method: 'POST',
            body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
        }).then(function () {
            alert('密码修改成功，请重新登录');
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }).catch(function (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        });
    });

    // ── 退出 ──
    document.getElementById('btnLogout').addEventListener('click', function () {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    });

    // ── 统计栏筛选 ──
    document.querySelectorAll('.stat-item[data-filter]').forEach(function (el) {
        el.addEventListener('click', function () {
            setFilter(this.getAttribute('data-filter'));
        });
    });
    setFilter('all');

    // ── 视图切换 ──
    var btnGrid = document.getElementById('btnGridView');
    var btnList = document.getElementById('btnListView');

    function setView(mode) {
        if (mode === 'list') {
            gridEl.classList.add('list-view');
            btnList.classList.add('view-active');
            btnGrid.classList.remove('view-active');
        } else {
            gridEl.classList.remove('list-view');
            btnGrid.classList.add('view-active');
            btnList.classList.remove('view-active');
        }
        localStorage.setItem('view-preference', mode);
    }

    btnGrid.addEventListener('click', function () { setView('grid'); });
    btnList.addEventListener('click', function () { setView('list'); });

    // 恢复上次的视图偏好
    setView(localStorage.getItem('view-preference') || 'grid');

    // ── 启动 ──
    loadServers().then(scheduleRefresh).catch(function (err) {
        console.error('初始化失败:', err);
    });
})();
