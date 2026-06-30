// 在线音乐页面

/**
 * 获取代理图片 URL
 * 如果是需要代理的 CDN 图片，使用代理避免 403
 */
function getProxyImageUrl(url) {
    if (!url) return url;
    // Bilibili CDN
    if (url.includes('hdslb.com')) {
        return `/api/online/proxy-image?url=${encodeURIComponent(url)}`;
    }
    // 网易云 CDN
    if (url.includes('music.126.net') || url.includes('p1.music.126.net')) {
        return `/api/online/proxy-image?url=${encodeURIComponent(url)}`;
    }
    return url;
}

const OnlinePage = {
    currentTracks: [],
    currentSource: 'bilibili',
    currentQuality: 'standard',
    currentPage: 1,
    currentLimit: 20,
    currentQuery: '',
    currentType: 'music',
    currentTotal: 0,
    downloadQueue: [],
    isDownloading: false,

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
        // 音源切换
        const sourceSelect = document.getElementById('music-source');
        if (sourceSelect) {
            sourceSelect.addEventListener('change', (e) => {
                this.currentSource = e.target.value;
                if (this.currentQuery) {
                    this.search(this.currentQuery);
                }
            });
        }

        // 音质切换
        const qualitySelect = document.getElementById('music-quality');
        if (qualitySelect) {
            qualitySelect.addEventListener('change', (e) => {
                this.currentQuality = e.target.value;
            });
        }
    },

    /**
     * 搜索
     */
    async search(query, type = 'music') {
        this.currentQuery = query;
        this.currentType = type;
        this.currentPage = 1;
        this.currentLimit = 20;

        const container = document.getElementById('search-results');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">搜索中...</div></div>';

        try {
            const data = await searchOnline(query, this.currentSource, this.currentPage, type);
            this.currentTracks = data.data || [];
            this.currentTotal = data.total || 0;

            if (this.currentTracks.length > 0) {
                this.renderTrackList(container, this.currentTracks, false);
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">未找到相关结果</div></div>';
            }
            this.updateLoadMore();
        } catch (error) {
            console.error('Search failed:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">搜索失败，请稍后重试</div></div>';
        }
    },

    /**
     * 加载更多
     */
    async loadMore() {
        this.currentPage++;

        try {
            showToast('加载中...', 'info');
            const data = await searchOnline(this.currentQuery, this.currentSource, this.currentPage, this.currentType);
            const newTracks = data.data || [];
            
            if (newTracks.length > 0) {
                this.currentTracks = [...this.currentTracks, ...newTracks];
                this.appendTracks(newTracks);
                showToast(`已加载 ${newTracks.length} 首歌曲`, 'success');
            } else {
                showToast('没有更多歌曲了', 'info');
            }
            this.updateLoadMore();
        } catch (error) {
            console.error('Load more failed:', error);
            showToast('加载失败', 'error');
        }
    },

    /**
     * 更新加载更多按钮状态
     */
    updateLoadMore() {
        const btn = document.getElementById('load-more');
        if (btn) {
            // 如果当前加载的数量小于 limit，说明没有更多了
            const hasMore = this.currentTracks.length < this.currentTotal || 
                           this.currentTracks.length % this.currentLimit === 0;
            btn.style.display = hasMore ? 'block' : 'none';
        }
    },

    /**
     * 渲染歌曲列表
     */
    renderTrackList(container, tracks, showIndex = false) {
        const tracksHtml = tracks.map((track, index) => {
            const indexClass = showIndex && index < 3 ? `top-${index + 1}` : '';
            const coverUrl = getProxyImageUrl(track.artwork) || '/static/img/default-cover.png';
            const sourceUrl = track.source_url || (track.bvid ? `https://www.bilibili.com/video/${track.bvid}` : '');
            return `
                <div class="track-item" data-index="${index}" data-song-id="online_${this.currentSource}_${track.bvid || track.id}_${index}"
                     style="animation-delay: ${Math.min(index * 0.05, 1)}s">
                    ${showIndex ? `<span class="track-index ${indexClass}">${index + 1}</span>` : ''}
                    <div class="track-cover" onclick="OnlinePage.playTrack(${index})">
                        <img class="lazy-cover" data-src="${coverUrl}" 
                             src="/static/img/default-cover.png" alt="cover"
                             onerror="this.src='/static/img/default-cover.png'">
                    </div>
                    <div class="track-info" onclick="OnlinePage.playTrack(${index})">
                        <div class="track-title">${track.title || ''}</div>
                        <div class="track-artist">${track.artist || ''}</div>
                    </div>
                    <span class="track-duration">${formatTime(track.duration || 0)}</span>
                    <div class="track-actions">
                        <button class="btn-action" onclick="event.stopPropagation(); OnlinePage.playTrack(${index})" title="播放">
                            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                        <button class="btn-action" onclick="event.stopPropagation(); OnlinePage.downloadTrack(${index})" title="下载">
                            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                        </button>
                        ${sourceUrl ? `
                        <button class="btn-action" onclick="event.stopPropagation(); window.open('${sourceUrl}', '_blank')" title="查看来源">
                            <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = tracksHtml;

        // 初始化懒加载
        if (typeof refreshLazyLoad === 'function') {
            refreshLazyLoad();
        }

        // 渲染后恢复播放高亮
        Player.updatePlayUI();
    },

    /**
     * 追加歌曲到列表
     */
    appendTracks(tracks) {
        const container = document.getElementById('search-results');
        const startIndex = this.currentTracks.length - tracks.length;

        const tracksHtml = tracks.map((track, i) => {
            const index = startIndex + i;
            const coverUrl = getProxyImageUrl(track.artwork) || '/static/img/default-cover.png';
            const sourceUrl = track.source_url || (track.bvid ? `https://www.bilibili.com/video/${track.bvid}` : '');
            return `
                <div class="track-item" data-index="${index}" data-song-id="online_${this.currentSource}_${track.bvid || track.id}_${index}"
                     style="animation-delay: ${Math.min(i * 0.05, 1)}s">
                    <div class="track-cover" onclick="OnlinePage.playTrack(${index})">
                        <img class="lazy-cover" data-src="${coverUrl}" 
                             src="/static/img/default-cover.png" alt="cover"
                             onerror="this.src='/static/img/default-cover.png'">
                    </div>
                    <div class="track-info" onclick="OnlinePage.playTrack(${index})">
                        <div class="track-title">${track.title || ''}</div>
                        <div class="track-artist">${track.artist || ''}</div>
                    </div>
                    <span class="track-duration">${formatTime(track.duration || 0)}</span>
                    <div class="track-actions">
                        <button class="btn-action" onclick="event.stopPropagation(); OnlinePage.playTrack(${index})" title="播放">
                            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                        <button class="btn-action" onclick="event.stopPropagation(); OnlinePage.downloadTrack(${index})" title="下载">
                            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                        </button>
                        ${sourceUrl ? `
                        <button class="btn-action" onclick="event.stopPropagation(); window.open('${sourceUrl}', '_blank')" title="查看来源">
                            <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // 在加载更多按钮前插入
        const loadMore = document.getElementById('load-more');
        loadMore.insertAdjacentHTML('beforebegin', tracksHtml);

        // 初始化懒加载
        if (typeof refreshLazyLoad === 'function') {
            refreshLazyLoad();
        }
    },

    /**
     * 切换单个选中状态
     */
    toggleSelect(index) {
        if (this.selectedIndices.has(index)) {
            this.selectedIndices.delete(index);
        } else {
            this.selectedIndices.add(index);
        }
        this.updateBatchActions();
    },

    /**
     * 切换全选
     */
    toggleSelectAll() {
        const selectAll = document.getElementById('select-all');
        if (selectAll.checked) {
            this.currentTracks.forEach((_, index) => {
                this.selectedIndices.add(index);
            });
        } else {
            this.selectedIndices.clear();
        }

        // 更新所有 checkbox
        document.querySelectorAll('.track-checkbox input').forEach(cb => {
            cb.checked = selectAll.checked;
        });

        this.updateBatchActions();
    },

    /**
     * 更新批量操作栏状态
     */
    updateBatchActions() {
        const count = this.selectedIndices.size;
        const btn = document.getElementById('btn-download-selected');
        const countEl = document.getElementById('selected-count');

        if (btn) {
            btn.disabled = count === 0;
        }
        if (countEl) {
            countEl.textContent = count;
        }
    },

    /**
     * 播放歌曲（统一使用 Player）
     */
    async playTrack(index) {
        if (!this.currentTracks || index >= this.currentTracks.length) return;

        const track = this.currentTracks[index];

        try {
            showToast(`正在加载: ${track.title}`, 'info');

            // 获取音频流
            const response = await fetchStreamUrl(this.currentSource, track, this.currentQuality);

            if (!response || !response.url) {
                showToast('无法获取音频流', 'error');
                return;
            }

            // 标准化 track 对象
            const normalizedTrack = {
                id: `online_${this.currentSource}_${track.bvid || track.id}_${index}`,
                title: track.title || '',
                artist: track.artist || '',
                album: track.album || '',
                cover_url: track.artwork || null,
                cover_path: null,
                updated_at: null,
                liked: 0,
                _sourceType: 'online',
                _streamUrl: response.url,
                _fileUrl: null,
                _originalTrack: track,  // 保留原始数据
            };

            // 构建播放列表
            const playlist = this.currentTracks.map((t, i) => ({
                id: `online_${this.currentSource}_${t.bvid || t.id}_${i}`,
                title: t.title || '',
                artist: t.artist || '',
                album: t.album || '',
                cover_url: t.artwork || null,
                cover_path: null,
                updated_at: null,
                liked: 0,
                _sourceType: 'online',
                _streamUrl: null,  // 播放时再获取
                _fileUrl: null,
                _originalTrack: t,  // 保留原始数据
            }));

            // 保存当前源信息供播放列表使用
            Player._currentSource = this.currentSource;
            Player._currentQuality = this.currentQuality;

            // 使用 Player 统一播放
            Player.play(normalizedTrack, playlist, index);
        } catch (error) {
            console.error('Play error:', error);
            showToast('播放失败: ' + error.message, 'error');
        }
    },

    /**
     * 下载单首歌曲（加入队列）
     */
    async downloadTrack(index) {
        if (!this.currentTracks || index >= this.currentTracks.length) return;

        const track = this.currentTracks[index];
        
        // 加入下载队列
        this.downloadQueue.push({
            source: this.currentSource,
            track: track,
            quality: this.currentQuality
        });
        
        showToast(`已加入下载队列: ${track.title}`, 'info');
        
        // 如果当前没有下载任务，开始处理队列
        if (!this.isDownloading) {
            this.processDownloadQueue();
        }
    },

    /**
     * 处理下载队列
     */
    async processDownloadQueue() {
        if (this.downloadQueue.length === 0) {
            this.isDownloading = false;
            return;
        }
        
        this.isDownloading = true;
        const { source, track, quality } = this.downloadQueue.shift();
        
        try {
            showToast(`正在下载: ${track.title}`, 'info');
            const result = await downloadOnlineMusic(source, track, quality);
            showToast(`下载完成: ${track.title}`, 'success');
            
            // 下载完成后自动刷新下载管理页面
            if (typeof App !== 'undefined') {
                App.loadDownloads();
            }
        } catch (error) {
            console.error('Download error:', error);
            showToast(`下载失败: ${track.title}`, 'error');
        }
        
        // 继续处理下一个
        this.processDownloadQueue();
    },
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    OnlinePage.init();
});
