// API 调用封装

const API_BASE = '';

/**
 * 通用 API 请求
 */
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${url}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error [${url}]:`, error);
        throw error;
    }
}

// ==================== 在线音乐 API ====================

/**
 * 搜索在线音乐
 * @param {string} query - 搜索关键词
 * @param {string} source - 音乐源 (bilibili)
 * @param {number} page - 页码
 * @param {string} type - 搜索类型 (music, album, artist)
 */
async function searchOnline(query, source = 'bilibili', page = 1, type = 'music') {
    return apiRequest(
        `/api/online/search?q=${encodeURIComponent(query)}&source=${source}&page=${page}&type=${type}`
    );
}

/**
 * 获取音频流 URL
 * @param {string} source - 音乐源
 * @param {object} track - 歌曲信息
 * @param {string} quality - 音质 (low, standard, high, super)
 */
async function fetchStreamUrl(source, track, quality = 'standard') {
    return apiRequest('/api/online/stream', {
        method: 'POST',
        body: JSON.stringify({ source, track, quality }),
    });
}

/**
 * 获取歌词
 * @param {string} source - 音乐源
 * @param {string} id - 歌曲ID
 */
async function fetchOnlineLyric(source, id) {
    return apiRequest(`/api/online/lyric?source=${source}&id=${encodeURIComponent(id)}`);
}

/**
 * 获取可用音乐源列表
 */
async function fetchSources() {
    return apiRequest('/api/online/sources');
}

/**
 * 获取指定源支持的搜索类型
 * @param {string} source - 音乐源
 */
async function fetchSearchTypes(source) {
    return apiRequest(`/api/online/search-types?source=${source}`);
}

/**
 * 获取专辑详情
 * @param {string} source - 音乐源
 * @param {string} albumId - 专辑ID
 * @param {number} page - 页码
 */
async function fetchOnlineAlbum(source, albumId, page = 1) {
    return apiRequest(`/api/online/album/${source}/${encodeURIComponent(albumId)}?page=${page}`);
}

/**
 * 获取榜单列表
 * @param {string} source - 音乐源
 */
async function fetchTopLists(source) {
    return apiRequest(`/api/online/toplists/${source}`);
}

/**
 * 获取榜单详情
 * @param {string} source - 音乐源
 * @param {string} topId - 榜单ID
 * @param {number} page - 页码
 */
async function fetchTopListDetail(source, topId, page = 1) {
    return apiRequest(`/api/online/toplists/${source}/${encodeURIComponent(topId)}?page=${page}`);
}

/**
 * 下载在线音乐
 * @param {string} source - 音乐源
 * @param {object} track - 歌曲信息
 * @param {string} quality - 音质
 */
async function downloadOnlineMusic(source, track, quality = 'standard') {
    return apiRequest('/api/online/download', {
        method: 'POST',
        body: JSON.stringify({ source, track, quality }),
    });
}

// ==================== 下载管理 API ====================

/**
 * 获取下载列表
 */
async function fetchDownloads(params = {}) {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.size) searchParams.set('size', params.size);
    if (params.status) searchParams.set('status', params.status);
    return apiRequest(`/api/local/downloads?${searchParams.toString()}`);
}

/**
 * 删除下载记录
 */
async function deleteDownload(downloadId) {
    return apiRequest(`/api/local/downloads/${downloadId}`, {
        method: 'DELETE',
    });
}

// ==================== 本地音乐 API ====================

/**
 * 获取本地歌曲列表
 */
async function fetchLocalSongs(params = {}) {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.size) searchParams.set('size', params.size);
    if (params.artist) searchParams.set('artist', params.artist);
    if (params.album) searchParams.set('album', params.album);
    if (params.liked !== undefined) searchParams.set('liked', params.liked);
    if (params.search) searchParams.set('search', params.search);
    if (params.path_prefix) searchParams.set('path_prefix', params.path_prefix);
    if (params.source_url !== undefined) searchParams.set('source_url', params.source_url);
    return apiRequest(`/api/local/songs?${searchParams.toString()}`);
}

/**
 * 获取歌曲详情
 */
async function fetchSongDetail(songId) {
    return apiRequest(`/api/local/songs/${songId}`);
}

/**
 * 更新歌曲元数据
 */
async function updateSong(songId, data) {
    return apiRequest(`/api/local/songs/${songId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * 删除歌曲
 */
async function deleteSong(songId) {
    return apiRequest(`/api/local/songs/${songId}`, {
        method: 'DELETE',
    });
}

/**
 * 获取歌手列表
 */
async function fetchArtists() {
    return apiRequest('/api/local/artists');
}

/**
 * 获取专辑列表
 */
async function fetchAlbums(artist = null) {
    const params = artist ? `?artist=${encodeURIComponent(artist)}` : '';
    return apiRequest(`/api/local/albums${params}`);
}

/**
 * 扫描音乐目录
 */
async function scanMusicDirectory() {
    return apiRequest('/api/local/scan', { method: 'POST' });
}

/**
 * 获取播放列表
 */
async function fetchPlaylists() {
    return apiRequest('/api/local/playlists');
}

/**
 * 创建播放列表
 */
async function createPlaylist(name, description = '') {
    return apiRequest('/api/local/playlists', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
    });
}

/**
 * 收藏/取消收藏
 */
async function toggleLike(songId) {
    return apiRequest(`/api/local/songs/${songId}/like`, { method: 'PUT' });
}

// ==================== 音频流 URL ====================

/**
 * 获取本地音频流 URL
 */
function getStreamUrl(songId) {
    return `/api/stream/${songId}`;
}

/**
 * 获取本地歌曲歌词
 */
async function fetchLyrics(songId) {
    return apiRequest(`/api/local/songs/${songId}/lyrics`);
}

// ==================== 刮削 API ====================

/**
 * 搜索刮削候选（本地歌曲）
 */
async function scrapeSearch(songId) {
    return apiRequest(`/api/local/songs/${songId}/scrape/search`, {
        method: 'POST',
    });
}

/**
 * 应用刮削结果（本地歌曲）
 */
async function scrapeApply(songId, neteaseId, writeTitle = true, writeArtist = true, writeAlbum = true, writeCover = true, writeLyrics = true) {
    return apiRequest(`/api/local/songs/${songId}/scrape/apply`, {
        method: 'POST',
        body: JSON.stringify({
            netease_id: neteaseId,
            write_title: writeTitle,
            write_artist: writeArtist,
            write_album: writeAlbum,
            write_cover: writeCover,
            write_lyrics: writeLyrics,
        }),
    });
}

/**
 * 获取歌词预览
 */
async function fetchLyricsPreview(neteaseId) {
    return apiRequest(`/api/local/scrape/lyrics-preview?netease_id=${neteaseId}`, {
        method: 'POST',
    });
}
