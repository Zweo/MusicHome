// Howler.js 播放器

const Player = {
    sound: null,
    currentTrack: null,
    playlist: [],
    currentIndex: -1,
    isPlaying: false,
    playMode: 'loop', // loop, single, shuffle, sequential
    volume: 0.8,
    isMuted: false,
    
    // 频谱可视化
    audioContext: null,
    analyser: null,
    dataArray: null,
    animationId: null,

    /**
     * 初始化播放器
     */
    init() {
        this.bindEvents();
        this.loadSettings();
        this.updateVolumeUI();
        this.initWaveform();
    },

    /**
     * 绑定事件
     */
    bindEvents() {
        // 播放/暂停
        document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());

        // 上一曲/下一曲
        document.getElementById('btn-prev').addEventListener('click', () => this.prev());
        document.getElementById('btn-next').addEventListener('click', () => this.next());

        // 播放模式
        document.getElementById('btn-mode').addEventListener('click', () => this.togglePlayMode());

        // 音量
        document.getElementById('btn-volume').addEventListener('click', () => this.toggleMute());

        // 进度条
        const progressBar = document.getElementById('progress-bar');
        progressBar.addEventListener('click', (e) => this.seekTo(e));

        // 音量条
        const volumeBar = document.getElementById('volume-bar');
        volumeBar.addEventListener('click', (e) => this.setVolume(e));

        // 播放队列
        document.getElementById('btn-queue').addEventListener('click', () => this.toggleQueue());
        document.getElementById('queue-close').addEventListener('click', () => this.toggleQueue());



        // 歌词
        document.getElementById('btn-lyrics').addEventListener('click', () => this.toggleLyrics());
        document.getElementById('lyrics-close').addEventListener('click', () => this.toggleLyrics());

        // 封面点击 - 切换全屏歌词
        document.getElementById('player-cover').addEventListener('click', () => this.toggleFullscreenLyrics());

        // 全屏歌词关闭
        document.getElementById('fullscreen-lyrics-close').addEventListener('click', () => this.closeFullscreenLyrics());
    },

    /**
     * 加载设置
     */
    loadSettings() {
        const settings = localStorage.getItem('playerSettings');
        if (settings) {
            const parsed = JSON.parse(settings);
            this.volume = parsed.volume || 0.8;
            this.playMode = parsed.playMode || 'loop';
        }
        this.updateModeUI();
    },

    /**
     * 保存设置
     */
    saveSettings() {
        localStorage.setItem('playerSettings', JSON.stringify({
            volume: this.volume,
            playMode: this.playMode,
        }));
    },

    /**
     * 播放歌曲（统一入口）
     * @param {Object} track - 歌曲对象，包含 _sourceType, _streamUrl, _fileUrl 等
     * @param {Array} playlist - 播放列表
     * @param {number} index - 当前索引
     */
    async play(track, playlist = null, index = -1) {
        // 停止当前播放
        if (this.sound) {
            this.sound.unload();
            this.sound = null;
        }
        this.stopProgressUpdate();

        this.currentTrack = track;
        this.isPlaying = true;

        // 立即更新 UI（不等待 onplay）
        this.updatePlayUI();
        this.updateTrackUI();
        this.updateQueueUI();

        // 更新播放列表
        if (playlist) {
            this.playlist = playlist;
            this.currentIndex = index;
        }

        // 获取音频 URL
        let streamUrl = null;
        const sourceType = track._sourceType || 'local';

        if (sourceType === 'online') {
            // 在线播放：需要获取 stream URL
            if (track._streamUrl) {
                streamUrl = track._streamUrl;
            } else {
                // 需要异步获取 stream URL（播放列表下一首时）
                showToast(`正在加载: ${track.title}`, 'info');
                try {
                    // 使用原始数据获取 stream URL
                    const originalTrack = track._originalTrack || track;
                    const response = await fetchStreamUrl(
                        this._currentSource || 'bilibili',
                        originalTrack,
                        this._currentQuality || 'standard'
                    );
                    if (response && response.url) {
                        streamUrl = response.url;
                        track._streamUrl = response.url;  // 缓存到 track
                    }
                } catch (e) {
                    console.error('Fetch stream URL error:', e);
                }
                if (!streamUrl) {
                    showToast('无法获取音频流', 'error');
                    return;
                }
            }
        } else {
            // 本地播放（包括下载的歌曲）
            streamUrl = getStreamUrl(track.id);
        }

        // 创建 Howl 实例
        this.sound = new Howl({
            src: [streamUrl],
            html5: true,
            volume: this.volume,
            onplay: () => {
                this.isPlaying = true;
                this.updatePlayUI();
                this.updateProgress();
                this.startProgressUpdate();
                // 连接音频分析器（在用户交互后）
                this.connectAudioAnalyser();
                this.updateWaveform('playing');
            },
            onpause: () => {
                this.isPlaying = false;
                this.updatePlayUI();
                this.stopProgressUpdate();
                this.updateWaveform('active');
            },
            onend: () => {
                this.onTrackEnd();
                this.updateWaveform('idle');
            },
            onloaderror: (id, error) => {
                if (typeof error === 'string' && error.includes('No codec support')) {
                    console.warn('Audio codec warning (ignored):', error);
                    return;
                }
                console.error('Load error:', error);
                showToast('音频加载失败', 'error');
            },
            onplayerror: (id, error) => {
                console.error('Play error:', error);
                showToast('播放失败', 'error');
            },
        });

        this.sound.play();

        // 加载歌词
        this.loadLyrics(track.id);

        // 更新播放次数（仅本地歌曲）
        if (sourceType === 'local') {
            this.incrementPlayCount(track.id);
        }
    },

    /**
     * 加载歌词
     */
    async loadLyrics(songId) {
        try {
            const data = await fetchLyrics(songId);
            if (data && data.lyrics) {
                Lyrics.load(data.lyrics);
            } else {
                Lyrics.load(null);
            }
        } catch (error) {
            console.error('Failed to load lyrics:', error);
            Lyrics.load(null);
        }
    },

    /**
     * 播放/暂停切换
     */
    togglePlay() {
        if (!this.sound) return;

        if (this.isPlaying) {
            this.sound.pause();
        } else {
            this.sound.play();
        }
    },

    /**
     * 上一曲
     */
    prev() {
        if (this.playlist.length === 0) return;

        let newIndex;
        if (this.playMode === 'shuffle') {
            newIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            newIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        }

        this.play(this.playlist[newIndex], this.playlist, newIndex);
    },

    /**
     * 下一曲
     */
    next() {
        if (this.playlist.length === 0) return;

        let newIndex;
        if (this.playMode === 'shuffle') {
            newIndex = Math.floor(Math.random() * this.playlist.length);
        } else if (this.playMode === 'single') {
            newIndex = this.currentIndex;
        } else {
            newIndex = (this.currentIndex + 1) % this.playlist.length;
        }

        this.play(this.playlist[newIndex], this.playlist, newIndex);
    },

    /**
     * 歌曲播放结束
     */
    onTrackEnd() {
        switch (this.playMode) {
            case 'single':
                this.sound.play();
                break;
            case 'sequential':
                if (this.currentIndex < this.playlist.length - 1) {
                    this.next();
                } else {
                    this.isPlaying = false;
                    this.updatePlayUI();
                }
                break;
            case 'loop':
            case 'shuffle':
                this.next();
                break;
        }
    },

    /**
     * 切换播放模式
     */
    togglePlayMode() {
        const modes = ['loop', 'single', 'shuffle', 'sequential'];
        const currentIndex = modes.indexOf(this.playMode);
        this.playMode = modes[(currentIndex + 1) % modes.length];
        this.updateModeUI();
        this.saveSettings();

        const modeNames = {
            loop: '列表循环',
            single: '单曲循环',
            shuffle: '随机播放',
            sequential: '顺序播放',
        };
        showToast(modeNames[this.playMode], 'info');
    },

    /**
     * 跳转到指定位置
     */
    seekTo(e) {
        if (!this.sound) return;

        const progressBar = document.getElementById('progress-bar');
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const duration = this.sound.duration();
        this.sound.seek(duration * percent);
    },

    /**
     * 设置音量
     */
    setVolume(e) {
        const volumeBar = document.getElementById('volume-bar');
        const rect = volumeBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        this.volume = percent;
        this.isMuted = false;

        if (this.sound) {
            this.sound.volume(this.volume);
        }

        this.updateVolumeUI();
        this.saveSettings();
    },

    /**
     * 切换静音
     */
    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.sound) {
            this.sound.mute(this.isMuted);
        }

        this.updateVolumeUI();
    },

    /**
     * 切换播放队列
     */
    toggleQueue() {
        const panel = document.getElementById('queue-panel');
        panel.classList.toggle('open');
    },

    /**
     * 切换歌词
     */
    toggleLyrics() {
        const panel = document.getElementById('lyrics-panel');
        const btn = document.getElementById('btn-lyrics');
        panel.classList.toggle('open');
        btn.classList.toggle('active');
    },

    /**
     * 切换全屏歌词面板
     */
    toggleFullscreenLyrics() {
        const panel = document.getElementById('fullscreen-lyrics');
        if (panel.classList.contains('open')) {
            this.closeFullscreenLyrics();
        } else {
            this.openFullscreenLyrics();
        }
    },

    /**
     * 打开全屏歌词面板
     */
    openFullscreenLyrics() {
        if (!this.currentTrack) return;

        const panel = document.getElementById('fullscreen-lyrics');
        const coverImg = document.getElementById('fullscreen-cover-img');
        const titleEl = document.getElementById('fullscreen-lyrics-title');
        const artistEl = document.getElementById('fullscreen-lyrics-artist');
        const cover = document.querySelector('.fullscreen-cover');

        // 更新信息
        coverImg.src = getCoverUrl(this.currentTrack.id);
        titleEl.textContent = this.currentTrack.title;
        artistEl.textContent = this.currentTrack.artist;

        // 同步封面旋转状态
        if (this.isPlaying) {
            cover.classList.add('spinning');
            cover.classList.remove('paused');
        } else {
            cover.classList.add('spinning', 'paused');
        }

        // 同步歌词
        if (typeof Lyrics !== 'undefined') {
            Lyrics.syncToFullscreen();
        }

        // 打开面板
        panel.classList.add('open');
        
        // 增加频谱高度
        const waveform = document.getElementById('waveform-container');
        if (waveform) {
            waveform.classList.add('lyrics-open');
            setTimeout(() => this.resizeWaveformCanvas(), 350);
        }
    },

    /**
     * 关闭全屏歌词面板
     */
    closeFullscreenLyrics() {
        const panel = document.getElementById('fullscreen-lyrics');
        panel.classList.remove('open');
        
        // 恢复频谱高度
        const waveform = document.getElementById('waveform-container');
        if (waveform) {
            waveform.classList.remove('lyrics-open');
            setTimeout(() => this.resizeWaveformCanvas(), 350);
        }
    },

    /**
     * 更新进度
     */
    startProgressUpdate() {
        this.stopProgressUpdate();  // 先停止旧的，防止泄漏
        this._progressInterval = setInterval(() => {
            this.updateProgress();
        }, 100);
    },

    stopProgressUpdate() {
        if (this._progressInterval) {
            clearInterval(this._progressInterval);
        }
    },

    updateProgress() {
        if (!this.sound) return;

        const currentTime = this.sound.seek() || 0;
        const duration = this.sound.duration() || 0;
        const percent = duration ? (currentTime / duration) * 100 : 0;

        document.getElementById('time-current').textContent = formatTime(currentTime);
        document.getElementById('time-total').textContent = formatTime(duration);
        document.getElementById('progress-played').style.width = `${percent}%`;
        document.getElementById('progress-handle').style.left = `${percent}%`;

        // 更新歌词
        if (typeof Lyrics !== 'undefined') {
            Lyrics.update(currentTime);
        }
    },

    /**
     * 更新 UI
     */
    updateTrackUI() {
        const track = this.currentTrack;
        if (!track) return;

        document.getElementById('player-title').textContent = track.title;
        document.getElementById('player-artist').textContent = track.artist;

        // 封面 URL：优先使用 cover_url（在线），否则使用 cover_path（本地）
        const coverUrl = track.cover_url
            ? getProxyImageUrl(track.cover_url)
            : getCoverUrl(track.cover_path, track.id, track.updated_at);
        document.getElementById('cover-img').src = coverUrl;

        // 启用标题滚动
        this.enableTitleScroll();

        // 启用封面旋转
        const cover = document.getElementById('player-cover');
        cover.classList.add('spinning');
        cover.classList.remove('paused');

        // 更新全屏歌词面板信息
        const fullscreenTitle = document.getElementById('fullscreen-lyrics-title');
        const fullscreenArtist = document.getElementById('fullscreen-lyrics-artist');
        const fullscreenCover = document.getElementById('fullscreen-cover-img');
        if (fullscreenTitle) fullscreenTitle.textContent = track.title;
        if (fullscreenArtist) fullscreenArtist.textContent = track.artist;
        if (fullscreenCover) fullscreenCover.src = coverUrl;

        // 更新页面标题
        document.title = `${track.title} - ${track.artist} | MusicHome`;
    },

    updatePlayUI() {
        const btn = document.getElementById('btn-play');
        const playerCover = document.getElementById('player-cover');
        const fullscreenCover = document.querySelector('.fullscreen-cover');

        if (this.isPlaying) {
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            playerCover.classList.remove('paused');
            if (fullscreenCover) fullscreenCover.classList.remove('paused');
        } else {
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            playerCover.classList.add('paused');
            if (fullscreenCover) fullscreenCover.classList.add('paused');
        }

        // 更新列表中的播放状态
        const currentId = this.currentTrack?.id;
        document.querySelectorAll('.track-item.playing').forEach(item => {
            if (item.dataset.songId !== String(currentId)) {
                item.classList.remove('playing');
            }
        });
        if (currentId) {
            const activeItem = document.querySelector(`.track-item[data-song-id="${currentId}"]`);
            if (activeItem && !activeItem.classList.contains('playing')) {
                activeItem.classList.add('playing');
            }
        }
    },

    updateModeUI() {
        const btn = document.getElementById('btn-mode');
        const icons = {
            loop: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
            single: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>',
            shuffle: '<svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
            sequential: '<svg viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>',
        };
        btn.innerHTML = icons[this.playMode];
        btn.classList.toggle('active', this.playMode !== 'loop');
    },

    /**
     * 初始化频谱可视化
     */
    initWaveform() {
        const canvas = document.getElementById('waveform-canvas');
        if (!canvas) return;
        
        this.waveformCanvas = canvas;
        this.waveformCtx = canvas.getContext('2d');
        this._connectedHowl = null;  // 已连接的 Howl 实例
        
        // 设置 canvas 尺寸
        this.resizeWaveformCanvas();
        window.addEventListener('resize', () => this.resizeWaveformCanvas());
    },

    /**
     * 调整 canvas 尺寸
     */
    resizeWaveformCanvas() {
        if (!this.waveformCanvas) return;
        // 使用 getBoundingClientRect 获取实际显示尺寸
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.waveformCanvas.width = rect.width || window.innerWidth;
        // 根据是否展开歌词面板设置高度
        const isOpen = this.waveformCanvas.parentElement?.classList.contains('lyrics-open');
        this.waveformCanvas.height = isOpen ? 250 : 120;
    },

    /**
     * 连接音频源到分析器（在用户交互后调用）
     */
    connectAudioAnalyser() {
        if (!this.sound) return;
        
        try {
            // 创建 AudioContext（如果还没有）
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // 恢复 AudioContext（处理自动播放限制）
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            // 获取 Howler.js 的音频节点
            const howl = this.sound;
            if (!howl || !howl._sounds || !howl._sounds[0]) return;
            
            const audioNode = howl._sounds[0]._node;
            
            // 检查是否已经连接过这个音频节点
            if (audioNode._waveformConnected) return;
            
            // 创建分析器
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.85;
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            
            // 创建音频源并连接
            const source = this.audioContext.createMediaElementSource(audioNode);
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            // 标记已连接
            audioNode._waveformConnected = true;
            console.log('Audio analyser connected');
        } catch (e) {
            console.warn('Failed to connect audio analyser:', e);
        }
    },

    /**
     * 更新频谱可视化状态
     */
    updateWaveform(state) {
        const container = document.getElementById('waveform-container');
        if (!container) return;
        
        switch (state) {
            case 'playing':
                container.classList.add('active');
                this.startWaveformAnimation();
                break;
            case 'active':
            case 'idle':
            default:
                container.classList.remove('active');
                this.stopWaveformAnimation();
                break;
        }
    },

    /**
     * 开始频谱动画
     */
    startWaveformAnimation() {
        if (this.animationId) return;
        this.drawWaveform();
    },

    /**
     * 停止频谱动画
     */
    stopWaveformAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        // 清空 canvas
        if (this.waveformCtx) {
            this.waveformCtx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
        }
    },

    /**
     * 绘制频谱（柱状图居中对称全宽 + 波浪居中）
     */
    drawWaveform() {
        if (!this.waveformCtx || !this.waveformCanvas) return;
        
        const ctx = this.waveformCtx;
        const canvas = this.waveformCanvas;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        
        // 清空画布
        ctx.clearRect(0, 0, width, height);
        
        // 获取主题色
        const style = getComputedStyle(document.documentElement);
        const primaryColor = style.getPropertyValue('--primary').trim() || '#FF6B9D';
        const secondaryColor = style.getPropertyValue('--secondary').trim() || '#C084FC';
        
        // 获取频率数据
        let hasRealData = false;
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            hasRealData = this.dataArray.some(v => v > 0);
        }
        
        // 柱状图参数 - 绘制范围80%（左右各留10%边距）
        const dataLength = hasRealData ? this.dataArray.length : 64;
        const halfLength = Math.floor(dataLength / 2);
        const drawWidth = width * 0.4;  // 每半边绘制宽度（总宽80%的一半）
        const sliceWidth = drawWidth / halfLength;
        const sliceWidthFull = centerX / halfLength;  // 波浪图使用全宽
        const barWidth = Math.max(2, sliceWidth * 0.8);  // 柱子宽度，0.8倍全宽
        
        if (hasRealData) {
            // 绘制柱状频谱条（从中心向两边拉伸）
            for (let i = 0; i < halfLength; i++) {
                const value = this.dataArray[i] / 255;
                const barHeight = value * height * 0.4;
                
                // 根据距离中心的比例计算透明度衰减
                const distRatio = i / halfLength;
                const alpha = 1 - distRatio * 0.7;
                const alphaBottom = Math.round(0xCC * alpha).toString(16).padStart(2, '0');
                const alphaTop = Math.round(0x88 * alpha).toString(16).padStart(2, '0');
                
                // 创建渐变（带透明度衰减）
                const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
                gradient.addColorStop(0, primaryColor + alphaBottom);
                gradient.addColorStop(1, secondaryColor + alphaTop);
                
                // 右半部分
                const xRight = centerX + i * sliceWidth;
                ctx.fillStyle = gradient;
                ctx.fillRect(xRight, height - barHeight, barWidth, barHeight);
                
                // 左半部分（镜像）
                const xLeft = centerX - (i + 1) * sliceWidth;
                ctx.fillRect(xLeft, height - barHeight, barWidth, barHeight);
            }
            
            // 绘制波浪曲线覆盖（从中心向两边）
            ctx.beginPath();
            ctx.moveTo(centerX, height);
            
            // 右半部分波浪
            for (let i = 0; i < halfLength; i++) {
                const x = centerX + i * sliceWidthFull;
                const value = this.dataArray[i] / 255;
                const amplitude = value * (height * 0.6);
                const y = height - amplitude;
                
                if (i === 0) {
                    ctx.lineTo(x, y);
                } else {
                    const prevX = centerX + (i - 1) * sliceWidthFull;
                    const prevValue = this.dataArray[i - 1] / 255;
                    const prevAmplitude = prevValue * (height * 0.6);
                    const prevY = height - prevAmplitude;
                    const cpX = (prevX + x) / 2;
                    ctx.quadraticCurveTo(cpX, prevY, x, y);
                }
            }
            
            ctx.lineTo(width, height);
            ctx.closePath();
            
            const gradientRight = ctx.createLinearGradient(centerX, 0, width, 0);
            gradientRight.addColorStop(0, primaryColor + '40');
            gradientRight.addColorStop(1, primaryColor + '00');
            ctx.fillStyle = gradientRight;
            ctx.fill();
            
            // 左半部分波浪（镜像）
            ctx.beginPath();
            ctx.moveTo(centerX, height);
            
            for (let i = 0; i < halfLength; i++) {
                const x = centerX - i * sliceWidthFull;
                const value = this.dataArray[i] / 255;
                const amplitude = value * (height * 0.6);
                const y = height - amplitude;
                
                if (i === 0) {
                    ctx.lineTo(x, y);
                } else {
                    const prevX = centerX - (i - 1) * sliceWidthFull;
                    const prevValue = this.dataArray[i - 1] / 255;
                    const prevAmplitude = prevValue * (height * 0.6);
                    const prevY = height - prevAmplitude;
                    const cpX = (prevX + x) / 2;
                    ctx.quadraticCurveTo(cpX, prevY, x, y);
                }
            }
            
            ctx.lineTo(0, height);
            ctx.closePath();
            
            const gradientLeft = ctx.createLinearGradient(centerX, 0, 0, 0);
            gradientLeft.addColorStop(0, primaryColor + '40');
            gradientLeft.addColorStop(1, primaryColor + '00');
            ctx.fillStyle = gradientLeft;
            ctx.fill();
            
        } else {
            // 静默状态 - 中心对称微弱柱状条
            const time = Date.now() / 1000;
            for (let i = 0; i < halfLength; i++) {
                const value = 0.05 + Math.sin(i * 0.3 + time) * 0.03;
                const barHeight = value * height * 0.3;
                
                ctx.fillStyle = primaryColor + '20';
                
                // 右半部分
                const xRight = centerX + i * sliceWidth;
                ctx.fillRect(xRight, height - barHeight, barWidth, barHeight);
                
                // 左半部分（镜像）
                const xLeft = centerX - (i + 1) * sliceWidth;
                ctx.fillRect(xLeft, height - barHeight, barWidth, barHeight);
            }
        }
        
        // 继续动画
        this.animationId = requestAnimationFrame(() => {
            if (this.isPlaying) {
                this.drawWaveform();
            } else {
                this.stopWaveformAnimation();
            }
        });
    },

    updateVolumeUI() {
        const volumeLevel = document.getElementById('volume-level');
        const volumeHandle = document.getElementById('volume-handle');
        const btnVolume = document.getElementById('btn-volume');

        const percent = this.isMuted ? 0 : this.volume * 100;
        volumeLevel.style.width = `${percent}%`;
        volumeHandle.style.left = `${percent}%`;

        if (this.isMuted || this.volume === 0) {
            btnVolume.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
        } else if (this.volume < 0.5) {
            btnVolume.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>';
        } else {
            btnVolume.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
        }
    },

    updateQueueUI() {
        const content = document.getElementById('queue-content');
        if (!content) return;

        content.innerHTML = this.playlist.map((track, index) => `
            <div class="queue-item ${track.id === this.currentTrack?.id ? 'playing' : ''}" 
                 data-index="${index}" onclick="Player.playByIndex(${index})">
                <span class="queue-item-index">${index + 1}</span>
                <div class="queue-item-info">
                    <div class="queue-item-title">${track.title}</div>
                    <div class="queue-item-artist">${track.artist}</div>
                </div>
            </div>
        `).join('');
    },

    /**
     * 按索引播放
     */
    playByIndex(index) {
        if (index >= 0 && index < this.playlist.length) {
            this.play(this.playlist[index], this.playlist, index);
        }
    },

    /**
     * 启用标题滚动
     */
    enableTitleScroll() {
        const titleEl = document.getElementById('player-title');
        const container = titleEl.parentElement;

        // 检查是否需要滚动
        requestAnimationFrame(() => {
            if (titleEl.scrollWidth > container.clientWidth) {
                titleEl.classList.add('scrolling');
            } else {
                titleEl.classList.remove('scrolling');
            }
        });
    },

    /**
     * 更新播放次数
     */
    async incrementPlayCount(songId) {
        try {
            // 这里可以调用 API 增加播放次数
            // await apiRequest(`/api/local/songs/${songId}/play`, { method: 'POST' });
        } catch (error) {
            // 静默失败
        }
    },
};

// 初始化播放器
document.addEventListener('DOMContentLoaded', () => {
    Player.init();
});
