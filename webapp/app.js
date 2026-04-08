const tg = window.Telegram.WebApp;
const initData = tg.initData;

// Inisialisasi WebApp
tg.expand();
tg.ready();

// Utilitas Keamanan (Anti-XSS)
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            "'": '&#039;'
        }[m];
    });
}

function formatDate(dateStr) {
    if (!dateStr) return 'Tgl. tidak diketahui';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Format tgl. salah';
        return d.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        return 'Tgl. bermasalah';
    }
}

// Tab Management
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${target}Tab`).classList.add('active');

            // Load data sesuai tab
            if (target === 'profile') loadProfile();
            if (target === 'albums') loadUserGallery();
            if (target === 'pending') loadPendingMedia();
            if (target === 'stats') loadGlobalStats();
        });
    });
}

let myAnonId = null;

async function handleSearch() {
    const input = document.getElementById('searchInput');
    const list = document.getElementById('searchResultsList');
    const info = document.getElementById('searchResultsInfo');
    const query = input.value.trim();

    if (!query) {
        tg.showAlert('⚠️ Silakan masukkan ID Kreator');
        return;
    }

    // Mencegah pencarian diri sendiri (Fix Bug 73)
    if (myAnonId && query.toLowerCase() === myAnonId.toLowerCase()) {
        tg.showAlert('💡 Ini adalah ID Anda sendiri. Silakan lihat media Anda di tab "Galeri".');
        return;
    }

    list.innerHTML = '<div class="loading">Mencari kreator...</div>';
    info.style.display = 'none';

    try {
        const res = await fetch(`/api/albums/search?anon_id=${encodeURIComponent(query)}`, {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await res.json();

        if (res.ok) {
            info.innerHTML = `✅ Ditemukan <b>${data.albums.length}</b> media dari kreator <code>${escapeHTML(data.creator.anonymous_id)}</code>`;
            info.style.display = 'block';
            
            if (data.albums.length === 0) {
                list.innerHTML = '<div class="empty-state">Kreator ini belum mempublikasikan media publik apa pun.</div>';
            } else {
                renderMediaList(data.albums, list, true);
            }
        } else {
            list.innerHTML = `<div class="error">❌ ${data.error || 'Terjadi kesalahan'}</div>`;
        }
    } catch (e) {
        list.innerHTML = '<div class="error">❌ Gagal melakukan pencarian. Periksa koneksi Anda.</div>';
    }
}

// Dashboard Data
async function loadProfile() {
    const content = document.getElementById('profileContent');
    try {
        const res = await fetch('/api/user/profile', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await res.json();

        if (res.ok) {
            const p = data.profile;
            const s = data.stats;
            myAnonId = p.anonymous_id; // Simpan ID untuk validasi pencarian (Fix Bug 73)

            // Update statistik ringkas (dashboard)
            document.getElementById('totalAlbums').textContent = s.total_albums || 0;
            document.getElementById('approvedAlbums').textContent = s.approved_albums || 0;
            document.getElementById('totalDownloads').textContent = s.total_downloads || 0;
            document.getElementById('avgRating').textContent = Number(s.avg_rating || 0).toFixed(1);

            // Update detail profil
            content.innerHTML = `
                <div class="user-profile-header">
                    <div class="avatar-placeholder">👤</div>
                    <div class="user-meta">
                        <h3>${escapeHTML(p.first_name)} ${escapeHTML(p.last_name || '')}</h3>
                        <p class="secondary-info">🆔 ${escapeHTML(p.anonymous_id)}</p>
                        <span class="badge ${p.is_admin ? 'badge-admin' : (p.is_public ? 'badge-public' : 'badge-private')}">
                            ${p.is_admin ? '🛡️ Administrator' : (p.is_public ? '🌐 Profil Publik' : '🔒 Profil Privat')}
                        </span>
                    </div>
                </div>
                
                <div class="anon-id-box ${p.is_public ? 'active' : ''}">
                    <div class="anon-label">Status ID Anonim di Pencarian:</div>
                    <div class="anon-value">${p.is_public ? '<b>' + escapeHTML(p.anonymous_id) + '</b>' : '<i>Disembunyikan</i>'}</div>
                    <p class="anon-hint">
                        ${p.is_public 
                            ? 'Orang lain dapat menemukan media Anda menggunakan ID ini.' 
                            : 'Aktifkan "Mode Publik" di pengaturan agar orang lain bisa menemukan karya Anda.'}
                    </p>
                </div>

                <div class="profile-details-grid">
                    <div class="detail-card">
                        <span class="label">Username</span>
                        <span class="value">${p.username ? '@' + escapeHTML(p.username) : '-'}</span>
                    </div>
                    <div class="detail-card">
                        <span class="label">Anggota Sejak</span>
                        <span class="value">${new Date(p.created_at).toLocaleDateString('id-ID')}</span>
                    </div>
                </div>
            `;
        } else {
            content.innerHTML = `<div class="error-box">⚠️ Gagal memuat profil: ${data.error}</div>`;
        }
    } catch (e) {
        content.innerHTML = '<div class="error-box">❌ Terjadi gangguan koneksi. Mohon muat ulang aplikasi.</div>';
    }
}

let currentGalleryPage = 1;

async function loadUserGallery(page = 1) {
    const list = document.getElementById('albumsList');
    if (page === 1) {
        list.innerHTML = '<div class="loading">Memuat galeri Anda...</div>';
        currentGalleryPage = 1;
    }

    try {
        const res = await fetch(`/api/user/albums?page=${page}&limit=10`, {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await res.json();

        if (res.ok) {
            if (page === 1) list.innerHTML = '';
            
            // Hapus tombol load more lama jika ada
            const oldMoreBtn = document.getElementById('loadMoreBtn');
            if (oldMoreBtn) oldMoreBtn.remove();

            if (!data.albums || data.albums.length === 0) {
                if (page === 1) {
                    list.innerHTML = '<div class="empty-state">Belum ada media yang terbit. Yuk publikasikan salah satu draf Anda!</div>';
                }
                return;
            }

            renderMediaList(data.albums, list);

            // Munculkan tombol muat lebih banyak jika jumlah data mencapai limit
            if (data.albums.length === 10) {
                const moreBtn = document.createElement('button');
                moreBtn.id = 'loadMoreBtn';
                moreBtn.className = 'btn-load-more';
                moreBtn.innerText = 'Tampilkan Media Lama ⬇️';
                moreBtn.onclick = () => {
                    currentGalleryPage++;
                    loadUserGallery(currentGalleryPage);
                };
                list.after(moreBtn);
            }
        } else {
            list.innerHTML = '<div class="error">⚠️ Gagal memuat data galeri</div>';
        }
    } catch (e) {
        list.innerHTML = '<div class="error">❌ Terjadi kesalahan jaringan</div>';
    }
}

async function loadPendingMedia() {
    const list = document.getElementById('pendingList');
    list.innerHTML = '<div class="loading">Memuat media tertunda...</div>';

    try {
        const res = await fetch('/api/user/pending', {
            headers: { 'X-Telegram-Init-Data': initData }
        });
        const data = await res.json();

        if (res.ok) {
            if (!data.media || data.media.length === 0) {
                list.innerHTML = '<div class="empty-state">Belum ada media di antrean pending.</div>';
                return;
            }

            list.innerHTML = '';
            data.media.forEach(item => {
                const card = document.createElement('div');
                card.className = 'album-card pending-card';
                card.innerHTML = `
                    <div class="album-header">
                        <span class="album-id">Draft #${item.id}</span>
                        <span class="album-date">${new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="album-info">
                        <p><strong>Media:</strong> ${item.media_count} item</p>
                        <div class="caption-section">
                            <label>Caption (Wajib):</label>
                            <textarea class="caption-edit" id="caption-${item.id}" placeholder="Berikan caption menarik...">${escapeHTML(item.caption || '')}</textarea>
                        </div>
                    </div>
                    <div class="album-actions">
                        <button class="btn-delete" onclick="handleDelete(${item.id})">🗑️ Hapus</button>
                        <button class="btn-save" onclick="saveCaption(${item.id})">💾 Simpan</button>
                        <button class="btn-upload" onclick="handleUpload(${item.id})">🚀 Upload</button>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } catch (e) {
        list.innerHTML = '<div class="error">Gagal memuat media pending</div>';
    }
}

async function saveCaption(id) {
    const caption = document.getElementById(`caption-${id}`).value;
    try {
        const res = await fetch(`/api/user/albums/${id}/caption`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData 
            },
            body: JSON.stringify({ caption })
        });
        const result = await res.json();
        if (result.success) {
            tg.showAlert('✅ Caption berhasil disimpan');
        } else {
            tg.showAlert('❌ Gagal simpan: ' + result.error);
        }
    } catch (e) {
        tg.showAlert('Terjadi kesalahan');
    }
}

async function handleUpload(id) {
    const caption = document.getElementById(`caption-${id}`).value.trim();
    if (!caption) {
        tg.showAlert('⚠️ Anda wajib mengisi caption sebelum mengirim media ke moderasi!');
        return;
    }

    tg.showConfirm('Kirim media ini ke moderasi admin?', async (ok) => {
        if (!ok) return;
        try {
            const res = await fetch(`/api/user/albums/${id}/submit`, {
                method: 'POST',
                headers: { 'X-Telegram-Init-Data': initData }
            });
            const result = await res.json();
            if (result.success) {
                tg.showAlert('🚀 Media berhasil dikirim ke moderasi!');
                loadPendingMedia();
                loadProfile();
            } else {
                tg.showAlert('❌ Gagal: ' + result.error);
            }
        } catch (e) {
            tg.showAlert('Terjadi kesalahan');
        }
    });
}

function renderMediaList(albums, container, isSearch = false) {
    if (!albums || albums.length === 0) {
        container.innerHTML = `<div class="empty-state">${isSearch ? 'Kreator ini belum memiliki media publik' : 'Belum ada media di galeri Anda'}</div>`;
        return;
    }

    container.innerHTML = '';
    albums.forEach(album => {
        const card = document.createElement('div');
        card.className = 'album-card';
        
        let statusBadge = '';
        if (!isSearch) {
            statusBadge = `<span class="status-badge status-${album.status}">${album.status.toUpperCase()}</span>`;
        }

        const dateText = formatDate(album.created_at);

        const ratingText = album.rating_count > 0 
            ? `⭐ ${Number(album.rating_avg || 0).toFixed(1)} (${album.rating_count})` 
            : `⭐ <small>Belum dinilai</small>`;

        card.innerHTML = `
            <div class="album-header">
                <span class="album-id">#${album.id}</span>
                ${statusBadge}
            </div>
            <div class="album-body">
                <p class="album-caption">${album.caption ? escapeHTML(album.caption) : '<i>Tanpa caption</i>'}</p>
                <div class="album-meta">
                    <span>🖼️ ${album.media_count || 0} Media</span>
                    <span>📥 ${album.download_count || 0} Unduhan</span>
                    <span>${ratingText}</span>
                </div>
                <div class="album-date">Diunggah pada: ${dateText}</div>
            </div>
            <div class="album-footer">
                ${isSearch ? 
                    `<button class="btn-view" onclick="openInBot('${escapeHTML(album.unique_token)}')">🚀 Lihat di Bot</button>` : 
                    `
                    <button class="btn-stats" onclick="viewStats(${album.id})">📊 Statistik</button>
                    <button class="btn-delete" onclick="handleDelete(${album.id})">🗑️ Hapus</button>
                    `
                }
            </div>
        `;
        container.appendChild(card);
    });
}

// Actions
async function handleDelete(id) {
    tg.showConfirm('Apakah Anda yakin ingin menghapus media ini?', async (ok) => {
        if (!ok) return;

        try {
            const res = await fetch(`/api/user/albums/${id}`, {
                method: 'DELETE',
                headers: { 'X-Telegram-Init-Data': initData }
            });
            const data = await res.json();
            if (data.success) {
                tg.showAlert('Media berhasil dihapus');
                // Refresh tab yang sedang aktif
                const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
                if (activeTab === 'albums') loadUserGallery();
                if (activeTab === 'pending') loadPendingMedia();
                loadProfile(); // Update count
            }
        } catch (e) {
            tg.showAlert('Gagal menghapus media');
        }
    });
}

function viewStats(id) {
    const statsContainer = document.getElementById('statsContent');
    const statsTab = document.querySelector('[data-tab="stats"]');
    
    // Switch to stats tab
    statsTab.click();
    
    statsContainer.innerHTML = '<div class="loading">Memuat statistik...</div>';

    fetch(`/api/user/albums/${id}/stats`, {
        headers: { 'X-Telegram-Init-Data': initData }
    })
    .then(res => res.json())
    .then(data => {
        if (data.stats && data.stats.length > 0) {
            let html = `<h3>Riwayat Unduhan Media #${id}</h3>`;
            html += '<table class="stats-table"><thead><tr><th>Waktu</th><th>ID Kreator (Pengunduh)</th></tr></thead><tbody>';
            data.stats.forEach(s => {
                html += `<tr>
                    <td>${new Date(s.downloaded_at).toLocaleString('id-ID')}</td>
                    <td>${escapeHTML(s.anonymous_id)}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            statsContainer.innerHTML = html;
        } else {
            statsContainer.innerHTML = `<h3>Statistik Media #${id}</h3><div class="empty-state">Belum ada riwayat unduhan untuk media ini.</div>`;
        }
    })
    .catch(e => {
        statsContainer.innerHTML = '<div class="error">Gagal memuat statistik</div>';
    });
}

async function updatePrivacy(isPublic) {
    try {
        const res = await fetch('/api/user/settings', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData 
            },
            body: JSON.stringify({ is_public: isPublic })
        });
        if (res.ok) {
            tg.showAlert(`Mode ${isPublic ? 'Publik' : 'Privat'} berhasil disimpan`);
            loadProfile(); // Refresh profile badges
        }
    } catch (e) {
        tg.showAlert('Gagal memperbarui pengaturan');
    }
}

async function loadGlobalStats() {
    const container = document.getElementById('statsContent');
    // Jika tidak ada data spesifik album yang sedang dilihat, tampilkan global
    if (container.innerHTML.includes('loading') || container.innerHTML === '') {
        try {
            const res = await fetch('/api/admin/stats', {
                headers: { 'X-Telegram-Init-Data': initData }
            });
            const data = await res.json();
            if (res.ok) {
                container.innerHTML = `
                    <h3>Statistik Platform (Admin)</h3>
                    <div class="profile-details-grid">
                        <div class="detail-card"><label>Total User</label><p>${data.total_users}</p></div>
                        <div class="detail-card"><label>Total Media</label><p>${data.total_albums}</p></div>
                        <div class="detail-card"><label>Disetujui</label><p>${data.approved_albums}</p></div>
                        <div class="detail-card"><label>Global Rating</label><p>⭐ ${data.global_avg_rating}</p></div>
                    </div>
                `;
            }
        } catch (e) {}
    }
}

// Variabel global untuk menyimpan info bot
let botUsername = 'BotAnon';

function openInBot(token) {
    if (!token) return;
    // Buka link bot secara dinamis (Fix Bug 62)
    tg.openTelegramLink(`https://t.me/${botUsername.replace('@', '')}?start=${token}`);
}

// Main Init
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    
    // Initial fetch (Hanya sekali, profil akan dimuat saat tab profil aktif/default)
    const activeTabButton = document.querySelector('.tab-btn.active');
    if (activeTabButton) {
        const target = activeTabButton.dataset.tab;
        if (target === 'profile') loadProfile();
        else if (target === 'stats') loadGlobalStats();
    }
    
    // Search button listener
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    
    // Enter key for search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    }
});