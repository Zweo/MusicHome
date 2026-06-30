// 主应用逻辑

const App = {
    currentPage: 'local-songs',
    currentTheme: 'dark',
    currentDownloads: [],
    searchMode: 'online', // 'online' or 'local'

    /**
     * 初始化应用
     */
    init() {
        this.bindEvents();
        this.loadTheme();
        
        // 延迟加载初始页面，确保所有组件都已初始化
        setTimeout(() => {
            this.loadInitialPage();
        }, 100);
        
        this.loadRandomBackground();
    },

    /**
     * 绑定事件
     */
    bindEvents() {
        // 导航菜单
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = item.dataset.page;
                if (page) {
                    this.switchPage(page);
                }
            });
        });

        // 主题切换 - 自定义下拉菜单
        const themeToggle = document.getElementById('theme-toggle');
        const themeDropdown = document.getElementById('theme-selector');
        
        if (themeToggle && themeDropdown) {
            // 切换下拉菜单
            themeToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                themeDropdown.classList.toggle('show');
                themeToggle.querySelector('.theme-arrow').classList.toggle('rotated');
            });
            
            // 阻止下拉菜单内的点击事件传播
            themeDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            // 选择主题
            themeDropdown.querySelectorAll('.theme-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const theme = option.dataset.theme;
                    const name = option.dataset.name;
                    this.setTheme(theme);
                    
                    // 更新选中状态
                    themeDropdown.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
                    option.classList.add('active');
                    
                    // 更新按钮显示
                    document.getElementById('theme-name').textContent = name;
                    const dot = option.querySelector('.theme-dot');
                    if (dot) {
                        document.getElementById('theme-dot').style.background = dot.style.background;
                    }
                    
                    // 关闭下拉菜单
                    themeDropdown.classList.remove('show');
                    themeToggle.querySelector('.theme-arrow').classList.remove('rotated');
                });
            });
            
            // 点击其他地方关闭下拉菜单
            document.addEventListener('click', () => {
                themeDropdown.classList.remove('show');
                themeToggle.querySelector('.theme-arrow').classList.remove('rotated');
            });
        }

        // 搜索模式切换
        const modeToggle = document.getElementById('search-mode-toggle');
        if (modeToggle) {
            modeToggle.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const mode = btn.dataset.mode;
                    this.setSearchMode(mode);
                });
            });
        }

        // 搜索框
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim();
                    if (query) {
                        this.handleSearch(query);
                    }
                }
            });
        }

        // 模态框关闭
        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                closeModal();
            }
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            // 空格键播放/暂停
            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                Player.togglePlay();
            }

            // ESC 关闭面板
            if (e.code === 'Escape') {
                document.getElementById('lyrics-panel').classList.remove('open');
                document.getElementById('queue-panel').classList.remove('open');
                closeModal();
            }
        });
    },

    /**
     * 设置搜索模式
     */
    setSearchMode(mode) {
        this.searchMode = mode;
        
        // 更新按钮状态
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // 切换到对应页面
        if (mode === 'online') {
            this.switchPage('search-online');
        } else {
            this.switchPage('local-songs');
        }
    },

    /**
     * 处理搜索
     */
    handleSearch(query) {
        if (this.searchMode === 'online') {
            this.switchPage('search-online');
            OnlinePage.search(query);
        } else {
            LocalPage.search(query);
        }
    },

    /**
     * 切换页面
     */
    switchPage(pageName) {
        // 退出选中模式
        if (typeof LocalPage !== 'undefined' && LocalPage.selectedSongs) {
            LocalPage.clearSelection();
        }

        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageName) {
                item.classList.add('active');
            }
        });

        // 先隐藏所有页面
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // 下载管理页面复用本地歌曲页面
        if (pageName === 'downloads') {
            document.getElementById('page-local-songs').classList.add('active');
            document.querySelector('#page-local-songs .page-title').textContent = '下载管理';
            this.currentPage = pageName;
            this.loadPageData(pageName);
            return;
        }

        // 歌单详情页面复用本地歌曲页面
        if (pageName === 'playlist-detail') {
            document.getElementById('page-local-songs').classList.add('active');
            // 保持歌单导航高亮
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.page === 'local-playlists') {
                    item.classList.add('active');
                }
            });
            this.currentPage = pageName;
            return;
        }

        // 显示目标页面
        const targetPage = document.getElementById(`page-${pageName}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // 如果是从下载页面或播放列表切回本地歌曲，恢复标题
        if (pageName === 'local-songs' && (this.currentPage === 'downloads' || this.currentPage === 'playlist-detail')) {
            document.querySelector('#page-local-songs .page-title').textContent = '全部歌曲';
            LocalPage.currentPlaylistId = null;
            LocalPage.currentPlaylistName = null;
            LocalPage.currentPlaylistSongs = null;
        }

        this.currentPage = pageName;

        // 加载页面数据
        this.loadPageData(pageName);
    },

    /**
     * 加载页面数据
     */
    loadPageData(pageName) {
        switch (pageName) {
            case 'local-songs':
                LocalPage.loadSongs();
                break;
            case 'local-artists':
                LocalPage.loadArtists();
                break;
            case 'local-albums':
                LocalPage.loadAlbums();
                break;
            case 'local-playlists':
                LocalPage.loadPlaylists();
                break;
            case 'local-liked':
                LocalPage.loadLiked();
                break;
            case 'search-online':
                // 搜索页面等待用户输入
                break;
            case 'downloads':
                this.loadDownloads();
                break;
        }
    },

    /**
     * 加载初始页面
     */
    loadInitialPage() {
        this.switchPage('local-songs');
    },

    /**
     * 加载下载列表 - 复用 LocalPage.loadSongs
     */
    async loadDownloads() {
        // 复用本地歌曲页面，使用 source_url 筛选下载歌曲
        LocalPage.loadSongs({ source_url: true }, false, 'local-songs-list');
    },

    /**
     * 播放下载的歌曲 - 与本地歌曲相同
     */
    playDownload(index) {
        if (!this.currentDownloads || index >= this.currentDownloads.length) return;

        const download = this.currentDownloads[index];
        if (download.status !== 'completed' || !download.file_path) {
            showToast('歌曲未下载完成', 'warning');
            return;
        }

        // 直接用数字 ID，Player 会用 /api/stream/{id}
        Player.play(download, this.currentDownloads, index);
    },

    /**
     * 删除下载记录
     */
    async deleteDownload(downloadId) {
        if (!confirm('确定要删除这个下载吗？')) return;

        try {
            await deleteDownload(downloadId);
            showToast('删除成功', 'success');
            this.loadDownloads();
        } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
        }
    },

    /**
     * 刮削下载的歌曲
     */
    async scrapeDownload(downloadId) {
        try {
            showToast('正在搜索...', 'info');
            
            // 搜索候选
            const result = await scrapeSearchDownload(downloadId);
            const candidates = result.candidates || [];
            
            if (candidates.length === 0) {
                showToast('未找到匹配结果', 'warning');
                return;
            }
            
            // 显示候选列表弹窗
            LocalPage._showScrapeModal(downloadId, candidates, 'download');
        } catch (error) {
            showToast('搜索失败: ' + error.message, 'error');
        }
    },

    /**
     * 加载随机背景
     */
    async loadRandomBackground() {
        try {
            // 这里可以实现从 F:/Media/Picture 加载随机图片
            // 目前使用纯色背景
        } catch (error) {
            console.log('Failed to load background:', error);
        }
    },

    /**
     * 加载主题设置
     */
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.currentTheme = savedTheme;
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // 更新主题选择器 UI
        const themeDropdown = document.getElementById('theme-dropdown');
        if (themeDropdown) {
            const activeOption = themeDropdown.querySelector(`[data-theme="${savedTheme}"]`);
            if (activeOption) {
                // 更新选中状态
                themeDropdown.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
                activeOption.classList.add('active');
                
                // 更新按钮显示
                const name = activeOption.dataset.name;
                const dot = activeOption.querySelector('.theme-dot');
                document.getElementById('theme-name').textContent = name || '暗夜';
                if (dot) {
                    document.getElementById('theme-dot').style.background = dot.style.background;
                }
            }
        }
    },

    /**
     * 设置主题
     */
    setTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        const themeNames = {
            'dark': '暗夜',
            'light': '亮白',
            'miku': '青绿',
            'reimu': '红白',
            'raiden': '紫金',
            'ganyu': '冰蓝',
            '2b': '银灰',
            'emilia': '梦紫',
            'sakura': '樱粉',
            'skyblue': '天蓝',
            'mint': '薄荷',
            'sunshine': '暖阳',
            'lavender': '薰衣草',
            'ocean': '海浪',
            'fire': '火焰',
            'aurora': '极光',
        };
        showToast(`已切换到${themeNames[theme] || theme}主题`, 'info');
    },

    /**
     * 切换主题（保留兼容性）
     */
    toggleTheme() {
        const themes = ['dark', 'light', 'miku', 'reimu', 'raiden', 'ganyu', '2b', 'emilia', 'sakura', 'skyblue', 'mint', 'sunshine', 'lavender', 'ocean', 'fire', 'aurora'];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.setTheme(themes[nextIndex]);
    },
};

// DOMContentLoaded 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
