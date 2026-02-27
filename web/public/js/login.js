(function () {
    if (localStorage.getItem('token')) {
        window.location.href = '/';
        return;
    }

    var form = document.getElementById('loginForm');
    var errorEl = document.getElementById('loginError');

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        errorEl.classList.add('hidden');

        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value;

        fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (result) {
            if (!result.ok) throw new Error(result.data.error || '登录失败');
            localStorage.setItem('token', result.data.token);
            window.location.href = '/';
        })
        .catch(function (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        });
    });
})();
