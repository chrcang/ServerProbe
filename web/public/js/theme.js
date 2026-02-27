// 避免 FOUC
(function () {
    var THEME_KEY = 'theme-preference';

    // 状态
    var currentTheme = localStorage.getItem(THEME_KEY) || 'system';
    
    // 监听系统变化
    var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // 应用函数
    function applyTheme(theme) {
        if (theme === 'system') {
            if (mediaQuery.matches) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        } else if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        
        // 更新按钮图标（如果在 DOM 中）
        updateToggleIcon(theme);
    }

    // 切换函数
    window.toggleTheme = function () {
        var themes = ['light', 'dark', 'system'];
        var nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
        currentTheme = themes[nextIndex];
        localStorage.setItem(THEME_KEY, currentTheme);
        applyTheme(currentTheme);
    };

    function updateToggleIcon(theme) {
        var btn = document.getElementById('btnTheme');
        if (!btn) return;
        
        var iconMap = {
            'light': '<i class="ri-sun-line"></i>',
            'dark': '<i class="ri-moon-line"></i>',
            'system': '<i class="ri-computer-line"></i>'
        };
        var titleMap = {
            'light': '亮色模式',
            'dark': '暗色模式',
            'system': '跟随系统'
        };
        
        btn.innerHTML = iconMap[theme];
        btn.title = titleMap[theme];
    }

    // 初始化
    applyTheme(currentTheme);

    // 监听系统变化
    mediaQuery.addListener(function () {
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });

    // 等待 DOM 加载后更新按钮
    document.addEventListener('DOMContentLoaded', function () {
        updateToggleIcon(currentTheme);
        var btn = document.getElementById('btnTheme');
        if (btn) {
            btn.addEventListener('click', window.toggleTheme);
        }
    });
})();
