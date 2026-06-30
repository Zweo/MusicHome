// 本地音乐页面

const LocalPage = {
    currentSongs: [],
    currentView: 'songs', // songs, artists, albums, playlists, liked
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
    currentFilter: {},

    // 缓存相关
    songsCache: {},      // 缓存数据
    artistsCache: null,  // 歌手列表缓存
    albumsCache: {},     // 专辑列表缓存
    
    // 多选相关
    selectedSongs: new Set(),

    /**
     * 初始化
     */
    init() {
        this.bindEvents();
    },

    /**
     * 绑定事件
     */
    bindEvents() {
        // 搜索
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.search(e.target.value);
            }, 300));
        }

        // 初始化右键菜单
        this.initContextMenu();

        // 扫描按钮和创建播放列表使用 onclick 内联事件，无需绑定
    },

    /**
     * 初始化右键菜单
     */
    initContextMenu() {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // 右键点击歌曲项显示菜单
        document.addEventListener('contextmenu', (e) => {
            const trackItem = e.target.closest('.track-item');
            if (trackItem && trackItem.dataset.songId) {
                e.preventDefault();
                this.showContextMenu(e.clientX, e.clientY, trackItem.dataset.songId);
            }
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        // 按 ESC 关闭菜单
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
            }
        });

        // 菜单项点击事件
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                this.handleContextMenuAction(action);
                this.hideContextMenu();
            });
        });
    },

    /**
     * 显示右键菜单
     */
    showContextMenu(x, y, songId) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // 保存当前歌曲 ID
        this._contextMenuSongId = parseInt(songId);

        // 根据是否在歌单中显示/隐藏"移除"选项
        const removeItem = menu.querySelector('[data-action="remove-playlist"]');
        if (removeItem) {
            if (this.currentPlaylistId) {
                removeItem.classList.remove('hidden');
            } else {
                removeItem.classList.add('hidden');
            }
        }

        // 定位菜单
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.add('show');

        // 确保菜单不超出视窗
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }
    },

    /**
     * 隐藏右键菜单
     */
    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.classList.remove('show');
        }
    },

    /**
     * 处理右键菜单操作
     */
    handleContextMenuAction(action) {
        const songId = this._contextMenuSongId;
        if (!songId) return;

        switch (action) {
            case 'select':
                this.toggleSongSelection(songId);
                break;
            case 'edit':
                this.editSong(songId);
                break;
            case 'scrape':
                this.scrapeSong(songId);
                break;
            case 'add-playlist':
                this.showAddToPlaylistModal(songId);
                break;
            case 'remove-playlist':
                this.removeFromPlaylist(songId);
                break;
            case 'delete':
                this.deleteSong(songId);
                break;
        }
    },

    /**
     * 切换歌曲选中状态
     */
    toggleSongSelection(songId) {
        if (this.selectedSongs.has(songId)) {
            this.selectedSongs.delete(songId);
        } else {
            this.selectedSongs.add(songId);
        }
        this.updateSelectionUI();
    },

    /**
     * 更新选中状态 UI
     */
    updateSelectionUI() {
        // 更新歌曲列表的选中样式
        document.querySelectorAll('.track-item').forEach(item => {
            const songId = parseInt(item.dataset.songId);
            item.classList.toggle('selected', this.selectedSongs.has(songId));
        });
        
        // 更新批量操作栏
        const batchActions = document.getElementById('batch-actions');
        const batchCount = document.getElementById('batch-count');
        if (batchActions) {
            if (this.selectedSongs.size > 0) {
                batchActions.classList.add('show');
                batchCount.textContent = `已选 ${this.selectedSongs.size} 首`;
            } else {
                batchActions.classList.remove('show');
            }
        }
    },

    /**
     * 清除选中状态
     */
    clearSelection() {
        this.selectedSongs.clear();
        this.updateSelectionUI();
    },

    /**
     * 批量添加到歌单
     */
    async batchAddToPlaylist() {
        if (this.selectedSongs.size === 0) return;
        
        // 显示歌单选择弹窗
        try {
            const data = await fetchPlaylists();
            const playlists = data.playlists || [];
            
            if (playlists.length === 0) {
                showToast('暂无歌单，请先创建', 'warning');
                return;
            }
            
            const optionsHtml = playlists.map(playlist => `
                <div class="playlist-option" onclick="LocalPage._batchAddToPlaylist(${playlist.id})">
                    <span class="playlist-option-name">${playlist.name}</span>
                    <span class="playlist-option-count">${playlist.songs ? playlist.songs.length : 0} 首</span>
                </div>
            `).join('');
            
            const content = `
                <div class="add-to-playlist-modal">
                    <div class="playlist-options">
                        ${optionsHtml}
                    </div>
                </div>
            `;
            
            showModal('添加到歌单', content);
        } catch (error) {
            showToast('获取歌单失败', 'error');
        }
    },

    /**
     * 批量添加到指定歌单
     */
    async _batchAddToPlaylist(playlistId) {
        let successCount = 0;
        let failCount = 0;
        
        for (const songId of this.selectedSongs) {
            try {
                await apiRequest(`/api/local/playlists/${playlistId}/songs/${songId}`, {
                    method: 'POST',
                });
                successCount++;
            } catch (error) {
                failCount++;
            }
        }
        
        closeModal();
        this.clearSelection();
        
        if (failCount === 0) {
            showToast(`成功添加 ${successCount} 首歌曲到歌单`, 'success');
        } else {
            showToast(`添加完成：${successCount} 成功，${failCount} 失败`, 'warning');
        }
    },

    /**
     * 批量从歌单移除
     */
    async batchRemoveFromPlaylist() {
        if (this.selectedSongs.size === 0 || !this.currentPlaylistId) return;
        
        let successCount = 0;
        let failCount = 0;
        
        for (const songId of this.selectedSongs) {
            try {
                await apiRequest(`/api/local/playlists/${this.currentPlaylistId}/songs/${songId}`, {
                    method: 'DELETE',
                });
                successCount++;
            } catch (error) {
                failCount++;
            }
        }
        
        this.clearSelection();
        
        if (failCount === 0) {
            showToast(`成功移除 ${successCount} 首歌曲`, 'success');
        } else {
            showToast(`移除完成：${successCount} 成功，${failCount} 失败`, 'warning');
        }
        
        // 刷新列表
        this.loadPlaylist(this.currentPlaylistId);
    },

    /**
     * 批量删除
     */
    async batchDelete() {
        if (this.selectedSongs.size === 0) return;
        
        if (!confirm(`确定要删除选中的 ${this.selectedSongs.size} 首歌曲吗？`)) return;
        
        let successCount = 0;
        let failCount = 0;
        
        for (const songId of this.selectedSongs) {
            try {
                await deleteSong(songId);
                successCount++;
            } catch (error) {
                failCount++;
            }
        }
        
        this.clearSelection();
        
        if (failCount === 0) {
            showToast(`成功删除 ${successCount} 首歌曲`, 'success');
        } else {
            showToast(`删除完成：${successCount} 成功，${failCount} 失败`, 'warning');
        }
        
        // 刷新列表
        if (this.currentPlaylistId) {
            this.loadPlaylist(this.currentPlaylistId);
        } else {
            this.loadSongs(this.currentFilter, true);
        }
    },

    /**
     * 加载本地歌曲（带缓存）
     * @param {Object} params - 筛选参数
     * @param {boolean} forceRefresh - 强制刷新
     * @param {string} containerId - 容器元素 ID
     */
    async loadSongs(params = {}, forceRefresh = false, containerId = 'local-songs-list') {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 保存当前筛选条件
        this.currentFilter = params;

        // 添加分页参数
        params.page = this.currentPage;
        params.size = this.pageSize;

        // 生成缓存键
        const cacheKey = JSON.stringify(params);

        // 检查缓存是否有效
        if (!forceRefresh && this.songsCache[cacheKey]) {
            const cached = this.songsCache[cacheKey];
            this.currentSongs = cached.data.songs;
            this.totalPages = Math.ceil(cached.data.total / this.pageSize);

            if (this.currentSongs.length > 0) {
                this.renderSongList(container, this.currentSongs, false);  // 缓存不动画
                this.renderPagination(cached.data.total);
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📁</div>
                        <div class="empty-state-text">暂无本地歌曲</div>
                        <button class="btn-scan" onclick="LocalPage.scan()" style="margin-top: 16px">扫描音乐目录</button>
                    </div>
                `;
                const pagination = document.getElementById('pagination');
                if (pagination) pagination.style.display = 'none';
            }
            return;
        }

        // 缓存无效，请求 API
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';

        try {
            const data = await fetchLocalSongs(params);
            this.currentSongs = data.songs;

            // 保存到缓存
            this.songsCache[cacheKey] = {
                data: data,
                timestamp: Date.now()
            };

            // 计算总页数
            this.totalPages = Math.ceil(data.total / this.pageSize);

            if (data.songs && data.songs.length > 0) {
                this.renderSongList(container, data.songs, true);  // 新数据动画
                this.renderPagination(data.total);
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📁</div>
                        <div class="empty-state-text">暂无本地歌曲</div>
                        <button class="btn-scan" onclick="LocalPage.scan()" style="margin-top: 16px">扫描音乐目录</button>
                    </div>
                `;
                const pagination = document.getElementById('pagination');
                if (pagination) pagination.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to load songs:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">加载失败</div></div>';
        }
    },

    /**
     * 清除缓存
     */
    clearCache() {
        this.songsCache = {};
        this.artistsCache = null;
        this.albumsCache = {};
    },

    /**
     * 刷新当前列表
     */
    refreshList() {
        this.loadSongs(this.currentFilter, true);
    },

    /**
     * 加载歌手列表
     */
    async loadArtists() {
        const container = document.getElementById('artists-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';

        try {
            const artists = await fetchArtists();
            if (artists && artists.length > 0) {
                container.innerHTML = artists.map(artist => {
                    const coverUrl = getCoverUrl(artist.cover_path, artist.song_id) || '/static/img/default-cover.png';
                    return `
                    <div class="artist-card" onclick="LocalPage.filterByArtist('${artist.name}')">
                        <div class="artist-avatar">
                            <img class="lazy-cover" data-src="${coverUrl}" src="/static/img/default-cover.png" alt="cover"
                                 onerror="this.src='/static/img/default-cover.png'">
                        </div>
                        <div class="artist-name">${artist.name}</div>
                    </div>
                `}).join('');
                // 初始化懒加载
                if (typeof refreshLazyLoad === 'function') {
                    refreshLazyLoad();
                }
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-text">暂无歌手</div></div>';
            }
        } catch (error) {
            console.error('Failed to load artists:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">加载失败</div></div>';
        }
    },

    /**
     * 加载专辑列表
     */
    async loadAlbums(artist = null) {
        const container = document.getElementById('albums-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';

        try {
            const albums = await fetchAlbums(artist);
            if (albums && albums.length > 0) {
                container.innerHTML = albums.map(album => {
                    const coverUrl = getCoverUrl(album.cover_path, album.song_id) || '/static/img/default-cover.png';
                    return `
                    <div class="album-card" onclick="LocalPage.filterByAlbum('${album.name}')">
                        <div class="album-cover">
                            <img class="lazy-cover" data-src="${coverUrl}" src="/static/img/default-cover.png" alt="cover"
                                 onerror="this.src='/static/img/default-cover.png'">
                        </div>
                        <div class="album-title">${album.name}</div>
                        <div class="album-artist">${album.artist || '未知歌手'}</div>
                    </div>
                `}).join('');
                // 初始化懒加载
                if (typeof refreshLazyLoad === 'function') {
                    refreshLazyLoad();
                }
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💿</div><div class="empty-state-text">暂无专辑</div></div>';
            }
        } catch (error) {
            console.error('Failed to load albums:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">加载失败</div></div>';
        }
    },

    /**
     * 加载播放列表
     */
    async loadPlaylists() {
        const container = document.getElementById('playlists-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">加载中...</div></div>';

        try {
            const data = await fetchPlaylists();
            if (data.playlists && data.playlists.length > 0) {
                container.innerHTML = data.playlists.map(playlist => {
                    // 使用播放列表中第一首歌的封面
                    const firstSong = playlist.songs && playlist.songs.length > 0 ? playlist.songs[0] : null;
                    const coverUrl = firstSong ? getCoverUrl(firstSong.cover_path, firstSong.id) : '/static/img/default-cover.png';
                    return `
                    <div class="playlist-card" onclick="LocalPage.loadPlaylist(${playlist.id})">
                        <div class="playlist-cover">
                            <img class="lazy-cover" data-src="${coverUrl || '/static/img/default-cover.png'}" src="/static/img/default-cover.png" alt="cover"
                                 onerror="this.src='/static/img/default-cover.png'">
                        </div>
                        <div class="playlist-name">${playlist.name}</div>
                        <div class="playlist-count">${playlist.songs ? playlist.songs.length : 0} 首</div>
                    </div>
                `}).join('');
                // 初始化懒加载
                if (typeof refreshLazyLoad === 'function') {
                    refreshLazyLoad();
                }
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">暂无歌单</div></div>';
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">加载失败</div></div>';
        }
    },

    /**
     * 渲染歌曲列表
     */
    renderSongList(container, songs, animate = false) {
        const isInSelectionMode = this.selectedSongs.size > 0;
        
        container.innerHTML = songs.map((song, index) => {
            const isSelected = this.selectedSongs.has(song.id);
            return `
            <div class="track-item ${animate ? 'animate-in' : ''} ${isSelected ? 'selected' : ''}" 
                 data-song-id="${song.id}" data-index="${index}" 
                 style="animation-delay: ${Math.min(index * 0.05, 1)}s"
                 onclick="LocalPage.handleTrackClick(${song.id}, ${index}, event)">
                <label class="track-checkbox ${isInSelectionMode ? 'show' : ''}" onclick="event.stopPropagation()">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="LocalPage.toggleSongSelection(${song.id})">
                </label>
                <span class="track-index">${index + 1}</span>
                <div class="track-cover">
                    <img src="${getCoverUrl(song.cover_path, song.id, song.updated_at)}" alt="cover"
                         onerror="this.src='/static/img/default-cover.png'">
                </div>
                <div class="track-info">
                    <div class="track-title">${song.title}</div>
                    <div class="track-artist">${song.artist}</div>
                </div>
                <span class="track-duration">${formatTime(song.duration)}</span>
            </div>
        `}).join('');

        // 渲染后恢复播放高亮
        Player.updatePlayUI();
    },

    /**
     * 处理歌曲点击
     */
    handleTrackClick(songId, index, event) {
        // 如果在选中模式，点击切换选中状态
        if (this.selectedSongs.size > 0) {
            this.toggleSongSelection(songId);
        } else {
            // 否则播放歌曲
            this.playSong(index);
        }
    },

    /**
     * 播放歌曲
     */
    playSong(pageIndex) {
        if (!this.currentSongs || pageIndex >= this.currentSongs.length) return;

        // 如果是歌单分页模式，需要计算在完整歌单中的索引
        let song;
        let globalIndex;

        if (this.currentPlaylistId && this.currentPlaylistSongs) {
            // 歌单模式：从完整歌单中获取歌曲
            const startIndex = (this.currentPage - 1) * this.pageSize;
            globalIndex = startIndex + pageIndex;
            song = this.currentPlaylistSongs[globalIndex];
            // 使用完整歌单作为播放队列
            Player.play(song, this.currentPlaylistSongs, globalIndex);
        } else {
            // 普通模式
            song = this.currentSongs[pageIndex];
            Player.play(song, this.currentSongs, pageIndex);
        }
    },

    /**
     * 渲染分页组件
     */
    renderPagination(total) {
        const pagination = document.getElementById('pagination');
        const totalPagesEl = document.getElementById('total-pages');
        const pageInput = document.getElementById('page-input');
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');

        if (this.totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        totalPagesEl.textContent = this.totalPages;
        pageInput.value = this.currentPage;
        pageInput.max = this.totalPages;
        btnPrev.disabled = this.currentPage <= 1;
        btnNext.disabled = this.currentPage >= this.totalPages;
    },

    /**
     * 上一页
     */
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            if (this.currentPlaylistId) {
                this.loadPlaylist(this.currentPlaylistId);
            } else {
                this.loadSongs(this.currentFilter);
            }
        }
    },

    /**
     * 下一页
     */
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            if (this.currentPlaylistId) {
                this.loadPlaylist(this.currentPlaylistId);
            } else {
                this.loadSongs(this.currentFilter);
            }
        }
    },

    /**
     * 跳转到指定页
     */
    goToPage() {
        const pageInput = document.getElementById('page-input');
        const page = parseInt(pageInput.value);

        if (page && page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            if (this.currentPlaylistId) {
                this.loadPlaylist(this.currentPlaylistId);
            } else {
                this.loadSongs(this.currentFilter);
            }
        } else {
            showToast('请输入有效的页码', 'error');
        }
    },

    /**
     * 搜索
     */
    async search(query) {
        if (!query.trim()) {
            this.loadSongs();
            return;
        }

        const container = document.getElementById('local-songs-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">搜索中...</div></div>';

        try {
            const data = await fetchLocalSongs({ search: query });
            this.currentSongs = data.songs;

            if (data.songs && data.songs.length > 0) {
                this.renderSongList(container, data.songs);
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">未找到相关歌曲</div></div>';
            }
        } catch (error) {
            console.error('Search failed:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">搜索失败</div></div>';
        }
    },

    /**
     * 按歌手筛选
     */
    filterByArtist(artist) {
        // 切换到歌曲页面
        App.switchPage('local-songs');
        this.loadSongs({ artist });
    },

    /**
     * 按专辑筛选
     */
    filterByAlbum(album) {
        // 切换到歌曲页面
        App.switchPage('local-songs');
        this.loadSongs({ album });
    },

    /**
     * 扫描音乐目录
     */
    async scan() {
        try {
            // 显示进度条
            const progressContainer = document.getElementById('scan-progress');
            const progressBar = document.getElementById('scan-progress-bar');
            const progressText = document.getElementById('scan-progress-text');
            progressContainer.style.display = 'block';

            // 启动扫描
            const scanPromise = scanMusicDirectory();

            // 使用轮询管理器启动进度轮询
            PollingManager.start('scan-progress', async () => {
                try {
                    const progress = await apiRequest('/api/local/scan-progress');
                    if (progress.is_scanning) {
                        const percent = progress.total_files > 0
                            ? Math.round((progress.total_scanned / progress.total_files) * 100)
                            : 0;
                        progressBar.style.width = `${percent}%`;
                        progressText.textContent = `扫描中: ${progress.total_scanned}/${progress.total_files} - ${progress.current_file}`;
                    }
                } catch (e) {
                    // 忽略轮询错误
                }
            }, 500);

            // 等待扫描完成
            const result = await scanPromise;

            // 停止轮询
            PollingManager.stop('scan-progress');

            // 更新进度条
            progressBar.style.width = '100%';
            progressText.textContent = `扫描完成: 新增 ${result.new_added} 首，更新 ${result.updated} 首`;

            // 3秒后隐藏进度条
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 3000);

            showToast(`扫描完成: 新增 ${result.new_added} 首，更新 ${result.updated} 首`, 'success');
            this.loadSongs();
        } catch (error) {
            PollingManager.stop('scan-progress');
            document.getElementById('scan-progress').style.display = 'none';
            showToast('扫描失败: ' + error.message, 'error');
        }
    },


    /**
     * 编辑歌曲
     */
    async editSong(songId) {
        try {
            const song = await fetchSongDetail(songId);
            const content = `
                <form id="edit-song-form">
                    <div class="form-group">
                        <label>标题</label>
                        <input type="text" name="title" value="${song.title}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>歌手</label>
                        <input type="text" name="artist" value="${song.artist}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>专辑</label>
                        <input type="text" name="album" value="${song.album}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>音轨号</label>
                        <input type="number" name="track_number" value="${song.track_number}" class="form-input">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">保存</button>
                        <button type="button" class="btn-secondary" onclick="closeModal()">取消</button>
                    </div>
                </form>
            `;

            showModal('编辑歌曲信息', content);

            // 绑定表单提交
            document.getElementById('edit-song-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);

                try {
                    await updateSong(songId, data);
                    closeModal();
                    showToast('保存成功', 'success');
                    
                    // 根据当前状态刷新列表
                    if (this.currentPlaylistId) {
                        this.loadPlaylist(this.currentPlaylistId);
                    } else {
                        this.loadSongs(this.currentFilter, true);
                    }
                } catch (error) {
                    showToast('保存失败: ' + error.message, 'error');
                }
            });
        } catch (error) {
            showToast('获取歌曲信息失败', 'error');
        }
    },

    /**
     * 删除歌曲
     */
    async deleteSong(songId) {
        if (!confirm('确定要删除这首歌曲吗？')) return;

        try {
            await deleteSong(songId);
            showToast('删除成功', 'success');
            
            // 清除选中状态
            this.selectedSongs.delete(songId);
            this.updateSelectionUI();
            
            // 刷新列表
            if (this.currentPlaylistId) {
                this.loadPlaylist(this.currentPlaylistId);
            } else {
                this.loadSongs(this.currentFilter, true);
            }
        } catch (error) {
            showToast('删除失败: ' + error.message, 'error');
        }
    },

    /**
     * 显示添加到播放列表弹窗
     */
    async showAddToPlaylistModal(songId) {
        try {
            // 获取所有播放列表
            const data = await fetchPlaylists();
            const playlists = data.playlists || [];

            if (playlists.length === 0) {
                showToast('暂无歌单，请先创建', 'warning');
                return;
            }

            // 构建播放列表选项
            const optionsHtml = playlists.map(playlist => `
                <div class="playlist-option" onclick="LocalPage.addToPlaylist(${songId}, ${playlist.id})">
                    <span class="playlist-option-name">${playlist.name}</span>
                    <span class="playlist-option-count">${playlist.songs ? playlist.songs.length : 0} 首</span>
                </div>
            `).join('');

            const content = `
                <div class="add-to-playlist-modal">
                    <div class="playlist-options">
                        ${optionsHtml}
                    </div>
                </div>
            `;

            showModal('添加到歌单', content);
        } catch (error) {
            showToast('获取播放列表失败', 'error');
        }
    },

    /**
     * 添加歌曲到播放列表
     */
    async addToPlaylist(songId, playlistId) {
        try {
            const result = await apiRequest(`/api/local/playlists/${playlistId}/songs/${songId}`, {
                method: 'POST',
            });
            closeModal();
            showToast(result.message || '添加成功', 'success');
        } catch (error) {
            showToast('添加失败: ' + error.message, 'error');
        }
    },

    /**
     * 从歌单移除歌曲
     */
    async removeFromPlaylist(songId) {
        if (!this.currentPlaylistId) return;

        try {
            const result = await apiRequest(`/api/local/playlists/${this.currentPlaylistId}/songs/${songId}`, {
                method: 'DELETE',
            });
            showToast(result.message || '已移除', 'success');

            // 清除选中状态
            this.selectedSongs.delete(songId);
            this.updateSelectionUI();
            
            // 刷新列表
            this.loadPlaylist(this.currentPlaylistId);
        } catch (error) {
            showToast('移除失败: ' + error.message, 'error');
        }
    },

    /**
     * 刮削歌曲
     */
    async scrapeSong(songId) {
        try {
            showToast('正在搜索...', 'info');

            // 搜索候选
            const result = await scrapeSearch(songId);
            const candidates = result.candidates || [];

            // 获取歌曲信息用于显示搜索关键词
            const song = this.currentSongs.find(s => s.id === songId);
            const keyword = song ? `${song.title} ${song.artist}` : '';

            // 显示候选列表弹窗
            this._showScrapeModal(songId, candidates, 'song', keyword);
        } catch (error) {
            showToast('搜索失败: ' + error.message, 'error');
        }
    },

    /**
     * 显示刮削选择弹窗
     */
    _showScrapeModal(id, candidates, type = 'song', keyword = '') {
        const candidatesHtml = candidates.length > 0 ? candidates.map((item, index) => {
            const coverUrl = getProxyImageUrl(item.cover_url) || '/static/img/default-cover.png';
            const duration = formatTime(item.duration || 0);
            return `
                <div class="scrape-candidate ${index === 0 ? 'selected' : ''}" 
                     data-id="${item.id}" data-index="${index}"
                     onclick="LocalPage._selectScrapeCandidate(${index}); LocalPage._previewLyrics(${item.id})">
                    <img class="scrape-cover" src="${coverUrl}" alt="cover"
                         onerror="this.src='/static/img/default-cover.png'">
                    <div class="scrape-info">
                        <div class="scrape-title">${item.title || ''}</div>
                        <div class="scrape-artist">${item.artist || ''}</div>
                        <div class="scrape-album">${item.album || ''}</div>
                    </div>
                    <span class="scrape-duration">${duration}</span>
                </div>
            `;
        }).join('') : '<div class="scrape-empty">未找到匹配结果，请修改关键词后重新搜索</div>';

        const content = `
            <div class="scrape-modal">
                <div class="scrape-search">
                    <input type="text" id="scrape-keyword" class="form-input" value="${keyword}" placeholder="输入搜索关键词">
                    <button class="btn-primary btn-search" onclick="LocalPage._researchScrape(${id}, '${type}')">搜索</button>
                    <button class="btn-secondary btn-refresh" onclick="LocalPage._refreshScrapeCandidates(${id}, '${type}')" title="换一批">
                        <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                        <span>换一批</span>
                    </button>
                </div>
                <div class="scrape-candidates" id="scrape-candidates">
                    ${candidatesHtml}
                </div>
                <div class="scrape-options">
                    <label class="scrape-option">
                        <input type="checkbox" id="scrape-write-title" checked>
                        <span>标题</span>
                    </label>
                    <label class="scrape-option">
                        <input type="checkbox" id="scrape-write-artist" checked>
                        <span>歌手</span>
                    </label>
                    <label class="scrape-option">
                        <input type="checkbox" id="scrape-write-album" checked>
                        <span>专辑</span>
                    </label>
                    <label class="scrape-option">
                        <input type="checkbox" id="scrape-write-cover" checked>
                        <span>封面</span>
                    </label>
                    <label class="scrape-option">
                        <input type="checkbox" id="scrape-write-lyrics" checked>
                        <span>歌词</span>
                    </label>
                </div>
                <div class="scrape-actions">
                    <button class="btn-primary" onclick="LocalPage._applyScrape(${id}, '${type}')">应用</button>
                    <button class="btn-secondary" onclick="closeModal()">取消</button>
                </div>
            </div>
        `;

        showModal('刮削音乐信息', content);

        // 保存候选列表和选中索引
        this._scrapeCandidates = candidates;
        this._scrapeSelectedIndex = 0;
        this._scrapeId = id;
        this._scrapeType = type;

        // 绑定回车键搜索
        const input = document.getElementById('scrape-keyword');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this._researchScrape(id, type);
                }
            });
            input.focus();
        }
    },

    /**
     * 重新搜索刮削候选
     */
    async _researchScrape(id, type = 'song') {
        const keywordInput = document.getElementById('scrape-keyword');
        const keyword = keywordInput ? keywordInput.value.trim() : '';

        if (!keyword) {
            showToast('请输入搜索关键词', 'warning');
            return;
        }

        try {
            showToast('正在搜索...', 'info');

            // 调用搜索 API
            let result;
            if (type === 'song') {
                result = await apiRequest(`/api/local/songs/${id}/scrape/search`, {
                    method: 'POST',
                    body: JSON.stringify({ keyword }),
                });
            } else {
                result = await apiRequest(`/api/local/downloads/${id}/scrape/search`, {
                    method: 'POST',
                    body: JSON.stringify({ keyword }),
                });
            }

            const candidates = result.candidates || [];

            // 更新候选列表
            this._updateCandidatesList(candidates);
        } catch (error) {
            showToast('搜索失败: ' + error.message, 'error');
        }
    },

    /**
     * 换一批刮削候选
     */
    async _refreshScrapeCandidates(id, type = 'song') {
        const keywordInput = document.getElementById('scrape-keyword');
        const keyword = keywordInput ? keywordInput.value.trim() : '';

        if (!keyword) {
            showToast('请输入搜索关键词', 'warning');
            return;
        }

        // 增加页码
        this._scrapePage = (this._scrapePage || 1) + 1;

        try {
            showToast('正在获取新结果...', 'info');

            // 调用搜索 API（带页码）
            let result;
            if (type === 'song') {
                result = await apiRequest(`/api/local/songs/${id}/scrape/search`, {
                    method: 'POST',
                    body: JSON.stringify({ keyword, page: this._scrapePage }),
                });
            } else {
                result = await apiRequest(`/api/local/downloads/${id}/scrape/search`, {
                    method: 'POST',
                    body: JSON.stringify({ keyword, page: this._scrapePage }),
                });
            }

            const candidates = result.candidates || [];

            if (candidates.length === 0) {
                // 没有更多结果，重置页码
                this._scrapePage = 1;
                showToast('没有更多结果，已重置', 'info');

                // 重新搜索第一页
                let firstResult;
                if (type === 'song') {
                    firstResult = await apiRequest(`/api/local/songs/${id}/scrape/search`, {
                        method: 'POST',
                        body: JSON.stringify({ keyword, page: 1 }),
                    });
                } else {
                    firstResult = await apiRequest(`/api/local/downloads/${id}/scrape/search`, {
                        method: 'POST',
                        body: JSON.stringify({ keyword, page: 1 }),
                    });
                }
                this._updateCandidatesList(firstResult.candidates || []);
            } else {
                this._updateCandidatesList(candidates);
            }
        } catch (error) {
            showToast('获取新结果失败: ' + error.message, 'error');
        }
    },

    /**
     * 更新候选列表 UI
     */
    _updateCandidatesList(candidates) {
        const container = document.getElementById('scrape-candidates');
        if (candidates.length > 0) {
            container.innerHTML = candidates.map((item, index) => {
                const coverUrl = getProxyImageUrl(item.cover_url) || '/static/img/default-cover.png';
                const duration = formatTime(item.duration || 0);
                return `
                    <div class="scrape-candidate ${index === 0 ? 'selected' : ''}" 
                         data-id="${item.id}" data-index="${index}"
                         onclick="LocalPage._selectScrapeCandidate(${index}); LocalPage._previewLyrics(${item.id})">
                        <img class="scrape-cover" src="${coverUrl}" alt="cover"
                             onerror="this.src='/static/img/default-cover.png'">
                        <div class="scrape-info">
                            <div class="scrape-title">${item.title || ''}</div>
                            <div class="scrape-artist">${item.artist || ''}</div>
                            <div class="scrape-album">${item.album || ''}</div>
                        </div>
                        <span class="scrape-duration">${duration}</span>
                    </div>
                `;
            }).join('');

            this._scrapeCandidates = candidates;
            this._scrapeSelectedIndex = 0;
        } else {
            container.innerHTML = '<div class="scrape-empty">未找到匹配结果，请修改关键词后重新搜索</div>';
            this._scrapeCandidates = [];
            this._scrapeSelectedIndex = -1;
        }
    },

    /**
     * 预览歌词
     */
    async _previewLyrics(neteaseId) {
        // 创建或获取歌词预览面板
        let panel = document.getElementById('lyrics-preview-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'lyrics-preview-panel';
            panel.className = 'lyrics-preview-panel';
            document.body.appendChild(panel);
        }

        // 存储当前预览的歌曲ID
        panel.dataset.neteaseId = neteaseId;

        // 显示加载中
        panel.innerHTML = `
            <div class="lyrics-preview-header">
                <span class="lyrics-preview-title">歌词预览</span>
                <button class="lyrics-preview-close" onclick="LocalPage._hideLyricsPreview()">&times;</button>
            </div>
            <div class="lyrics-preview-content">
                <div class="lyrics-preview-loading">加载中...</div>
            </div>
        `;
        panel.classList.add('open');

        try {
            // 获取歌词
            const result = await fetchLyricsPreview(neteaseId);
            const lyrics = result.lyrics || '';

            // 显示歌词
            const lyricsHtml = lyrics ? lyrics.split('\n').map(line =>
                `<div class="lyrics-line">${line || '&nbsp;'}</div>`
            ).join('') : '<div class="lyrics-preview-empty">暂无歌词</div>';

            panel.innerHTML = `
                <div class="lyrics-preview-header">
                    <span class="lyrics-preview-title">歌词预览</span>
                    <button class="lyrics-preview-close" onclick="LocalPage._hideLyricsPreview()">&times;</button>
                </div>
                <div class="lyrics-preview-content">
                    ${lyricsHtml}
                </div>
            `;
        } catch (error) {
            panel.innerHTML = `
                <div class="lyrics-preview-header">
                    <span class="lyrics-preview-title">歌词预览</span>
                    <button class="lyrics-preview-close" onclick="LocalPage._hideLyricsPreview()">&times;</button>
                </div>
                <div class="lyrics-preview-content">
                    <div class="lyrics-preview-empty">获取歌词失败</div>
                </div>
            `;
        }
    },

    /**
     * 隐藏歌词预览
     */
    _hideLyricsPreview() {
        const panel = document.getElementById('lyrics-preview-panel');
        if (panel) {
            panel.classList.remove('open');
        }
    },

    /**
     * 选择刮削候选
     */
    _selectScrapeCandidate(index) {
        // 更新选中状态
        document.querySelectorAll('.scrape-candidate').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
        this._scrapeSelectedIndex = index;
    },

    /**
     * 应用刮削结果
     */
    async _applyScrape(id, type = 'song') {
        if (!this._scrapeCandidates || this._scrapeSelectedIndex === undefined) {
            showToast('请先选择一个候选', 'warning');
            return;
        }

        const candidate = this._scrapeCandidates[this._scrapeSelectedIndex];
        const writeTitle = document.getElementById('scrape-write-title').checked;
        const writeArtist = document.getElementById('scrape-write-artist').checked;
        const writeAlbum = document.getElementById('scrape-write-album').checked;
        const writeCover = document.getElementById('scrape-write-cover').checked;
        const writeLyrics = document.getElementById('scrape-write-lyrics').checked;

        try {
            showToast('正在应用刮削结果...', 'info');

            let result;
            if (type === 'song') {
                result = await scrapeApply(id, candidate.id, writeTitle, writeArtist, writeAlbum, writeCover, writeLyrics);
            } else {
                result = await scrapeApplyDownload(id, candidate.id, writeTitle, writeArtist, writeAlbum, writeCover, writeLyrics);
            }

            if (result.success) {
                closeModal();
                this._hideLyricsPreview();
                showToast('刮削成功', 'success');

                // 使用当前时间作为版本号（补零的分钟+秒）
                const now = new Date();
                const version = `${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

                // 只更新被刮削歌曲的封面图片
                const songItem = document.querySelector(`[data-song-id="${id}"]`);
                if (songItem) {
                    const img = songItem.querySelector('.track-cover img');
                    if (img) {
                        img.src = `/api/local/songs/${id}/cover?v=${version}`;
                    }
                    // 更新标题和艺术家（如果刮削改变了）
                    const titleEl = songItem.querySelector('.track-title');
                    if (titleEl && result.title) titleEl.textContent = result.title;
                    const artistEl = songItem.querySelector('.track-artist');
                    if (artistEl && result.artist) artistEl.textContent = result.artist;
                }

                // 如果正在播放的是被刮削的歌曲，同步更新播放栏
                if (Player.currentTrack && Player.currentTrack.id == id) {
                    // 更新 Player.currentTrack 的数据
                    Player.currentTrack.title = result.title || Player.currentTrack.title;
                    Player.currentTrack.artist = result.artist || Player.currentTrack.artist;
                    Player.currentTrack.updated_at = new Date().toISOString();

                    // 更新播放栏 UI
                    Player.updateTrackUI();
                }
            } else {
                showToast('刮削失败: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            showToast('刮削失败: ' + error.message, 'error');
        }
    },

    /**
     * 显示创建播放列表模态框
     */
    showCreatePlaylistModal() {
        const content = `
            <form id="create-playlist-form">
                <div class="form-group">
                    <label>名称</label>
                    <input type="text" name="name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea name="description" class="form-input" rows="3"></textarea>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn-primary">创建</button>
                    <button type="button" class="btn-secondary" onclick="closeModal()">取消</button>
                </div>
            </form>
        `;

        showModal('新建歌单', content);

        document.getElementById('create-playlist-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const name = formData.get('name');
            const description = formData.get('description');

            try {
                await createPlaylist(name, description);
                closeModal();
                showToast('创建成功', 'success');
                this.loadPlaylists();
            } catch (error) {
                showToast('创建失败: ' + error.message, 'error');
            }
        });
    },

    /**
     * 加载歌单歌曲
     */
    async loadPlaylist(playlistId) {
        try {
            // 获取歌单详情
            const playlist = await apiRequest(`/api/local/playlists/${playlistId}`);
            
            // 切换到歌单详情页面（必须在设置 currentPlaylistId 之前）
            App.switchPage('playlist-detail');
            
            // 保存当前歌单信息（在 switchPage 之后设置，避免被重置）
            this.currentPlaylistId = playlistId;
            this.currentPlaylistName = playlist.name;
            
            // 设置页面标题
            document.querySelector('#page-local-songs .page-title').textContent = playlist.name;
            
            const container = document.getElementById('local-songs-list');
            
            if (!playlist.songs || playlist.songs.length === 0) {
                // 歌单为空，显示空状态
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">歌单为空</div></div>';
                this.currentSongs = [];
                this.currentPlaylistSongs = [];
                this.renderPagination(0);
                return;
            }
            
            // 保存歌单歌曲并分页显示
            this.currentPlaylistSongs = playlist.songs;
            this.currentSongs = [...playlist.songs];
            
            // 计算分页
            this.totalPages = Math.ceil(playlist.songs.length / this.pageSize);
            const startIndex = (this.currentPage - 1) * this.pageSize;
            const endIndex = startIndex + this.pageSize;
            const pageSongs = playlist.songs.slice(startIndex, endIndex);
            
            // 渲染当前页歌曲
            this.renderSongList(container, pageSongs, true);
            
            // 显示分页
            this.renderPagination(playlist.songs.length);
        } catch (error) {
            console.error('Failed to load playlist:', error);
            showToast('加载歌单失败', 'error');
        }
    },
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    LocalPage.init();
});
