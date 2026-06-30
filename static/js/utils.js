// 工具函数

/**
 * 格式化时间（秒 -> mm:ss）
 */
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let index = 0;
    let size = bytes;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index++;
    }
    return `${size.toFixed(1)} ${units[index]}`;
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * 节流函数
 */
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * 显示 Toast 提示
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * 显示/隐藏加载动画
 */
function showLoading() {
    document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

/**
 * 显示模态框
 */
function showModal(title, content) {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');

    modalTitle.textContent = title;
    modalContent.innerHTML = content;
    overlay.classList.add('active');
}

/**
 * 关闭模态框
 */
function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('active');
    
    // 清理歌词预览面板
    const lyricsPreview = document.getElementById('lyrics-preview-panel');
    if (lyricsPreview) {
        lyricsPreview.classList.remove('open');
    }
}

/**
 * 生成随机 ID
 */
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

/**
 * 获取封面 URL
 * @param {number|string} songIdOrPath - 歌曲 ID、封面路径或封面 URL
 * @param {number} songId - 歌曲 ID（用于 API 调用）
 * @param {string} updatedAt - 更新时间（用于缓存版本号）
 */
function getCoverUrl(songIdOrPath, songId = null, updatedAt = null) {
    // 使用 updated_at 的补零分钟+秒作为版本号
    let version = '';
    if (updatedAt) {
        const d = new Date(updatedAt);
        version = `?v=${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    }
    
    if (!songIdOrPath) {
        if (songId) return `/api/local/songs/${songId}/cover${version}`;
        return '/static/img/default-cover.png';
    }
    // 如果是 URL（在线歌曲），直接返回
    if (typeof songIdOrPath === 'string' && songIdOrPath.startsWith('http')) return songIdOrPath;
    // 如果是相对路径，使用 API 端点
    if (typeof songIdOrPath === 'string' && songIdOrPath.length > 0) {
        if (songId) return `/api/local/songs/${songId}/cover${version}`;
        return '/static/img/default-cover.png';
    }
    // 如果是数字（歌曲 ID），使用 API 端点
    if (typeof songIdOrPath === 'number') return `/api/local/songs/${songIdOrPath}/cover${version}`;
    // 默认返回默认封面
    return '/static/img/default-cover.png';
}

/**
 * 随机选择背景图片
 */
async function loadRandomBackground() {
    try {
        const response = await fetch('/api/local/random-background');
        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                const bgOverlay = document.getElementById('bg-overlay');
                bgOverlay.style.backgroundImage = `url(${data.url})`;
                bgOverlay.style.backgroundSize = 'cover';
                bgOverlay.style.backgroundPosition = 'center';
            }
        }
    } catch (error) {
        console.log('Failed to load background:', error);
    }
}

/**
 * 添加涟漪效果
 */
function addRippleEffect(element) {
    element.addEventListener('click', function (e) {
        const ripple = document.createElement('span');
        ripple.style.position = 'absolute';
        ripple.style.width = '100px';
        ripple.style.height = '100px';
        ripple.style.background = 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)';
        ripple.style.borderRadius = '50%';
        ripple.style.transform = 'scale(0)';
        ripple.style.pointerEvents = 'none';

        const rect = this.getBoundingClientRect();
        ripple.style.left = `${e.clientX - rect.left - 50}px`;
        ripple.style.top = `${e.clientY - rect.top - 50}px`;

        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);

        requestAnimationFrame(() => {
            ripple.style.transition = 'transform 0.6s linear, opacity 0.6s linear';
            ripple.style.transform = 'scale(4)';
            ripple.style.opacity = '0';
        });

        setTimeout(() => ripple.remove(), 600);
    });
}

// DOMContentLoaded 后初始化涟漪效果
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.btn-play, .btn-scan, .btn-create-playlist').forEach(addRippleEffect);
});

/**
 * 初始化图片懒加载
 */
function initLazyLoad() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    img.classList.add('loaded');
                }
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '50px',
    });

    document.querySelectorAll('.lazy-cover').forEach(img => {
        observer.observe(img);
    });

    return observer;
}

/**
 * 延迟初始化懒加载（用于动态加载的内容）
 */
function refreshLazyLoad() {
    setTimeout(() => {
        initLazyLoad();
    }, 100);
}

/**
 * 全局轮询管理器
 */
const PollingManager = {
    intervals: {},

    /**
     * 启动轮询
     * @param {string} name - 轮询名称
     * @param {Function} callback - 回调函数
     * @param {number} delay - 间隔时间（毫秒）
     */
    start(name, callback, delay) {
        this.stop(name);  // 先停止已有的轮询
        this.intervals[name] = setInterval(callback, delay);
    },

    /**
     * 停止轮询
     * @param {string} name - 轮询名称
     */
    stop(name) {
        if (this.intervals[name]) {
            clearInterval(this.intervals[name]);
            delete this.intervals[name];
        }
    },

    /**
     * 停止所有轮询
     */
    stopAll() {
        Object.keys(this.intervals).forEach(name => this.stop(name));
    }
};

// 页面卸载时停止所有轮询
window.addEventListener('beforeunload', () => {
    PollingManager.stopAll();
});
