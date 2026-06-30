// 歌词显示模块

const Lyrics = {
    lines: [],
    currentLineIndex: -1,
    container: null,
    fullscreenContainer: null,

    /**
     * 初始化
     */
    init() {
        this.container = document.getElementById('lyrics-content');
        this.fullscreenContainer = document.getElementById('fullscreen-lyrics-list');
    },

    /**
     * 加载歌词
     */
    load(lyricsText) {
        if (!lyricsText) {
            this.container.innerHTML = '<div class="lyrics-placeholder">暂无歌词</div>';
            this.fullscreenContainer.innerHTML = '<div class="lyrics-placeholder">暂无歌词</div>';
            this.lines = [];
            return;
        }

        // 解析 LRC 格式歌词
        this.lines = this.parseLRC(lyricsText);

        // 如果 LRC 解析失败，尝试作为纯文本显示
        if (this.lines.length === 0) {
            const plainLines = lyricsText.split('\n')
                .filter(line => line.trim())
                .map((line, i) => ({ time: i * 5, text: line.trim() }));
            
            if (plainLines.length > 0) {
                this.lines = plainLines;
            } else {
                this.container.innerHTML = '<div class="lyrics-placeholder">暂无歌词</div>';
                this.fullscreenContainer.innerHTML = '<div class="lyrics-placeholder">暂无歌词</div>';
                return;
            }
        }

        // 渲染歌词
        this.render();
        this.renderFullscreen();
    },

    /**
     * 解析 LRC 格式
     */
    parseLRC(lrcText) {
        const lines = [];
        const lrcLines = lrcText.split('\n');

        for (const line of lrcLines) {
            // 匹配 [mm:ss.xx] 或 [mm:ss.xxx] 格式（支持1-2位分钟）
            const match = line.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3].padEnd(3, '0'));
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4].trim();

                if (text) {
                    lines.push({ time, text });
                }
            }
        }

        // 按时间排序
        lines.sort((a, b) => a.time - b.time);
        return lines;
    },

    /**
     * 渲染歌词
     */
    render() {
        this.container.innerHTML = this.lines.map((line, index) => `
            <div class="lyrics-line" data-index="${index}" data-time="${line.time}">
                ${line.text}
            </div>
        `).join('');

        // 添加点击事件
        this.container.querySelectorAll('.lyrics-line').forEach(el => {
            el.addEventListener('click', () => {
                const time = parseFloat(el.dataset.time);
                if (Player.sound) {
                    Player.sound.seek(time);
                }
            });
        });
    },

    /**
     * 渲染全屏歌词
     */
    renderFullscreen() {
        if (!this.fullscreenContainer) return;

        this.fullscreenContainer.innerHTML = this.lines.map((line, index) => `
            <div class="lyrics-line" data-index="${index}" data-time="${line.time}">
                ${line.text}
            </div>
        `).join('');

        // 添加点击事件
        this.fullscreenContainer.querySelectorAll('.lyrics-line').forEach(el => {
            el.addEventListener('click', () => {
                const time = parseFloat(el.dataset.time);
                if (Player.sound) {
                    Player.sound.seek(time);
                }
            });
        });
    },

    /**
     * 同步歌词到全屏面板
     */
    syncToFullscreen() {
        if (!this.fullscreenContainer) return;

        // 复制当前歌词到全屏面板
        this.renderFullscreen();

        // 同步当前高亮行
        if (this.currentLineIndex >= 0) {
            const lines = this.fullscreenContainer.querySelectorAll('.lyrics-line');
            lines.forEach((el, index) => {
                if (index === this.currentLineIndex) {
                    el.classList.add('active');
                    el.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                } else {
                    el.classList.remove('active');
                }
            });
        }
    },

    /**
     * 更新当前歌词行
     */
    update(currentTime) {
        if (this.lines.length === 0) return;

        // 找到当前应该高亮的行
        let newIndex = -1;
        for (let i = this.lines.length - 1; i >= 0; i--) {
            if (currentTime >= this.lines[i].time) {
                newIndex = i;
                break;
            }
        }

        // 如果行没变化，不更新
        if (newIndex === this.currentLineIndex) return;

        this.currentLineIndex = newIndex;

        // 更新侧边栏歌词高亮
        this.updateHighlight(this.container, newIndex);

        // 更新全屏歌词高亮
        this.updateHighlight(this.fullscreenContainer, newIndex);
    },

    /**
     * 更新指定容器中的歌词高亮
     */
    updateHighlight(container, activeIndex) {
        if (!container) return;

        const allLines = container.querySelectorAll('.lyrics-line');
        allLines.forEach((el, index) => {
            if (index === activeIndex) {
                el.classList.add('active');
                // 滚动到可视区域
                el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            } else {
                el.classList.remove('active');
            }
        });
    },

    /**
     * 清空歌词
     */
    clear() {
        this.lines = [];
        this.currentLineIndex = -1;
        this.container.innerHTML = '<div class="lyrics-placeholder">暂无歌词</div>';
    },
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    Lyrics.init();
});
