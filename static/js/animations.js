// 动效控制模块

const Animations = {
    /**
     * 初始化
     */
    init() {
        this.initScrollAnimations();
        this.initHoverEffects();
    },

    /**
     * 初始化滚动动画
     */
    initScrollAnimations() {
        // 使用 IntersectionObserver 实现滚动进入动画
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
        });

        // 观察所有需要动画的元素
        document.querySelectorAll('.track-item, .artist-card, .album-card, .playlist-card').forEach(el => {
            observer.observe(el);
        });
    },

    /**
     * 初始化悬停效果
     */
    initHoverEffects() {
        // 为卡片添加悬停发光效果
        document.querySelectorAll('.track-item, .artist-card, .album-card, .playlist-card').forEach(el => {
            el.addEventListener('mouseenter', () => {
                el.style.transition = 'all 0.3s ease';
            });
        });
    },

    /**
     * 页面切换动画
     */
    pageTransition(newPage) {
        const oldPage = document.querySelector('.page.active');
        if (oldPage) {
            oldPage.classList.add('page-leave');
            setTimeout(() => {
                oldPage.classList.remove('active', 'page-leave');
                newPage.classList.add('active', 'page-enter');
                setTimeout(() => {
                    newPage.classList.remove('page-enter');
                }, 300);
            }, 200);
        } else {
            newPage.classList.add('active');
        }
    },

    /**
     * 列表项进入动画
     */
    staggerItems(container) {
        const items = container.querySelectorAll('.track-item, .artist-card, .album-card, .playlist-card');
        items.forEach((item, index) => {
            item.style.animationDelay = `${index * 0.05}s`;
        });
    },

    /**
     * 按钮点击效果
     */
    buttonClickEffect(button) {
        button.classList.add('pulse');
        setTimeout(() => {
            button.classList.remove('pulse');
        }, 200);
    },

    /**
     * Toast 进入动画
     */
    toastEnter(toast) {
        toast.style.animation = 'slideInRight 0.3s ease forwards';
    },

    /**
     * Toast 退出动画
     */
    toastExit(toast) {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    },

    /**
     * 模态框打开动画
     */
    modalOpen(modal) {
        modal.style.animation = 'modalIn 0.3s ease forwards';
    },

    /**
     * 模态框关闭动画
     */
    modalClose(modal) {
        modal.style.animation = 'modalOut 0.2s ease forwards';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 200);
    },

    /**
     * 封面旋转动画控制
     */
    coverSpinStart(cover) {
        cover.classList.add('spinning');
        cover.classList.remove('paused');
    },

    coverSpinPause(cover) {
        cover.classList.add('paused');
    },

    coverSpinResume(cover) {
        cover.classList.remove('paused');
    },

    coverSpinStop(cover) {
        cover.classList.remove('spinning', 'paused');
    },

    /**
     * 进度条缓冲动画
     */
    updateBufferedProgress(element, percent) {
        element.style.transition = 'width 0.3s ease';
        element.style.width = `${percent}%`;
    },

    /**
     * 音量条动画
     */
    volumeChangeEffect(element) {
        element.style.transition = 'width 0.1s ease';
    },

    /**
     * 波形动画（用于播放状态指示）
     */
    createWaveform(container) {
        const waveform = document.createElement('div');
        waveform.className = 'waveform';
        for (let i = 0; i < 5; i++) {
            const bar = document.createElement('div');
            bar.className = 'waveform-bar';
            waveform.appendChild(bar);
        }
        container.appendChild(waveform);
        return waveform;
    },

    /**
     * 删除波形动画
     */
    removeWaveform(waveform) {
        if (waveform && waveform.parentNode) {
            waveform.parentNode.removeChild(waveform);
        }
    },
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    Animations.init();
});
