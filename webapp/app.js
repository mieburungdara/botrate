let tg = window.Telegram.WebApp;
tg.expand();

const initData = tg.initData;

document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
    loadUserAlbums();
    setupTabs();
});

async function fetchAPI(endpoint) {
    const response = await fetch(`/api${endpoint}`, {
        headers: {
            'X-Telegram-Init-Data': initData
        }
    });
    return response.json();
}

async function loadUserProfile() {
    try {
        const data = await fetchAPI('/user/profile');
        
        document.getElementById('userInfo').textContent = `${data.profile.first_name} @${data.profile.username || '-'}`;
        document.getElementById('totalAlbums').textContent = data.stats.total_albums || 0;
        document.getElementById('approvedAlbums').textContent = data.stats.approved_albums || 0;
        document.getElementById('totalDownloads').textContent = data.stats.total_downloads || 0;
        document.getElementById('avgRating').textContent = data.stats.avg_rating ? data.stats.avg_rating.toFixed(1) : '0.0';
        
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

async function loadUserAlbums() {
    const container = document.getElementById('albumsList');
    container.innerHTML = '<div class="loading">Memuat album...</div>';

    try {
        const data = await fetchAPI('/user/albums');
        
        if (data.albums.length === 0) {
            container.innerHTML = '<div class="loading">Belum ada album yang dikirim</div>';
            return;
        }

        container.innerHTML = data.albums.map(album => `
            <div class="album-item">
                <div class="album-header">
                    <div>
                        <strong>Album #${album.id}</strong>
                        <div class="album-meta">${new Date(album.created_at).toLocaleDateString('id-ID')}</div>
                    </div>
                    <span class="album-status status-${album.status}">
                        ${album.status === 'pending' ? 'Menunggu' : album.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                    </span>
                </div>
                <div class="album-caption">${album.caption || 'Tanpa caption'}</div>
                <div class="album-meta">
                    📥 ${album.download_count} unduhan | ⭐ ${album.rating_avg || 0} (${album.rating_count} rating)
                </div>
            </div>
        `).join('');

    } catch (error) {
        container.innerHTML = '<div class="loading">Gagal memuat album</div>';
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${tabId}Tab`).classList.add('active');
        });
    });
}
