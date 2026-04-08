<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BotRate - Web App</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        :root {
            --tg-theme-bg-color: #ffffff;
            --tg-theme-text-color: #000000;
            --tg-theme-hint-color: #999999;
            --tg-theme-link-color: #2678b6;
            --tg-theme-button-color: #2678b6;
            --tg-theme-button-text-color: #ffffff;
            --tg-theme-secondary-bg-color: #f0f0f0;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--tg-theme-bg-color);
            color: var(--tg-theme-text-color);
            padding: 16px;
            padding-bottom: 70px;
        }

        .header { text-align: center; padding: 16px 0; border-bottom: 1px solid var(--tg-theme-secondary-bg-color); margin-bottom: 16px; }
        .header h1 { font-size: 20px; }
        .header p { color: var(--tg-theme-hint-color); font-size: 13px; }

        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .stat-card { background: var(--tg-theme-secondary-bg-color); border-radius: 10px; padding: 12px; text-align: center; }
        .stat-card .value { font-size: 22px; font-weight: bold; color: var(--tg-theme-button-color); }
        .stat-card .label { font-size: 11px; color: var(--tg-theme-hint-color); margin-top: 2px; }

        .album-list h2 { font-size: 16px; margin-bottom: 10px; }
        .album-card { background: var(--tg-theme-secondary-bg-color); border-radius: 10px; padding: 12px; margin-bottom: 8px; }
        .album-card .status { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
        .status-pending { background: #fff3cd; color: #856404; }
        .status-approved { background: #d4edda; color: #155724; }
        .status-rejected { background: #f8d7da; color: #721c24; }
        .album-card .caption { margin-top: 6px; font-size: 13px; }
        .album-card .meta { margin-top: 6px; font-size: 11px; color: var(--tg-theme-hint-color); }
        .share-btn { display: inline-block; margin-top: 8px; padding: 6px 12px; background: var(--tg-theme-button-color); color: var(--tg-theme-button-text-color); border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }

        .profile-info { background: var(--tg-theme-secondary-bg-color); border-radius: 10px; padding: 16px; }
        .profile-info .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--tg-theme-bg-color); }
        .profile-info .row:last-child { border-bottom: none; }
        .profile-info .label { color: var(--tg-theme-hint-color); font-size: 13px; }
        .profile-info .value { font-size: 13px; font-weight: 500; }

        .toggle-btn { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; padding: 12px; background: var(--tg-theme-secondary-bg-color); border-radius: 10px; }
        .toggle-switch { width: 50px; height: 28px; background: #ccc; border-radius: 14px; position: relative; cursor: pointer; transition: background 0.3s; }
        .toggle-switch.active { background: var(--tg-theme-button-color); }
        .toggle-switch::after { content: ''; position: absolute; width: 24px; height: 24px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: transform 0.3s; }
        .toggle-switch.active::after { transform: translateX(22px); }

        .leaderboard-item { display: flex; align-items: center; padding: 10px; background: var(--tg-theme-secondary-bg-color); border-radius: 10px; margin-bottom: 6px; }
        .leaderboard-item .rank { width: 30px; height: 30px; background: var(--tg-theme-button-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; margin-right: 10px; }
        .leaderboard-item .info { flex: 1; }
        .leaderboard-item .name { font-size: 14px; font-weight: 500; }
        .leaderboard-item .count { font-size: 12px; color: var(--tg-theme-hint-color); }

        .admin-card { background: var(--tg-theme-secondary-bg-color); border-radius: 10px; padding: 12px; margin-bottom: 8px; }
        .admin-card .sender { font-size: 12px; color: var(--tg-theme-hint-color); }
        .admin-card .actions { display: flex; gap: 8px; margin-top: 8px; }
        .btn-approve { flex: 1; padding: 8px; background: #28a745; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn-reject { flex: 1; padding: 8px; background: #dc3545; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }

        .tab-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: var(--tg-theme-secondary-bg-color); border-top: 1px solid var(--tg-theme-bg-color); z-index: 100; }
        .tab { flex: 1; padding: 10px; text-align: center; font-size: 11px; color: var(--tg-theme-hint-color); cursor: pointer; transition: color 0.2s; }
        .tab.active { color: var(--tg-theme-button-color); font-weight: 500; }

        .page { display: none; }
        .page.active { display: block; }

        .loading { text-align: center; padding: 40px; color: var(--tg-theme-hint-color); }
        .error { background: #f8d7da; color: #721c24; padding: 12px; border-radius: 10px; margin: 12px 0; display: none; }

        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 200; align-items: center; justify-content: center; }
        .modal.show { display: flex; }
        .modal-content { background: var(--tg-theme-bg-color); border-radius: 12px; padding: 20px; max-width: 90%; width: 350px; }
        .modal-content h3 { margin-bottom: 12px; }
        .modal-content .reason-btn { display: block; width: 100%; padding: 10px; margin-bottom: 6px; background: var(--tg-theme-secondary-bg-color); border: none; border-radius: 8px; text-align: left; cursor: pointer; font-size: 13px; }
        .modal-content .reason-btn:hover { background: var(--tg-theme-button-color); color: white; }
        .modal-close { width: 100%; padding: 10px; background: var(--tg-theme-button-color); color: white; border: none; border-radius: 8px; margin-top: 10px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="header">
        <h1>BotRate</h1>
        <p>Dashboard Kontributor</p>
    </div>

    <div id="error" class="error"></div>

    <!-- HOME PAGE -->
    <div id="page-home" class="page active">
        <div class="stats">
            <div class="stat-card"><div class="value" id="albumCount">0</div><div class="label">Album</div></div>
            <div class="stat-card"><div class="value" id="downloadCount">0</div><div class="label">Download</div></div>
            <div class="stat-card"><div class="value" id="pendingCount">0</div><div class="label">Pending</div></div>
        </div>
        <div class="album-list">
            <h2>Album Saya</h2>
            <div id="albumsList"><div class="loading">Memuat...</div></div>
        </div>
    </div>

    <!-- PROFILE PAGE -->
    <div id="page-profile" class="page">
        <div class="profile-info">
            <div class="row"><span class="label">User ID</span><span class="value" id="profileUserId">-</span></div>
            <div class="row"><span class="label">Username</span><span class="value" id="profileUsername">-</span></div>
            <div class="row"><span class="label">Nama</span><span class="value" id="profileName">-</span></div>
            <div class="row"><span class="label">Anonim</span><span class="value" id="profileAnon">-</span></div>
            <div class="row"><span class="label">Total Album</span><span class="value" id="profileAlbums">0</span></div>
            <div class="row"><span class="label">Total Download</span><span class="value" id="profileDownloads">0</span></div>
        </div>
        <div class="toggle-btn">
            <span>Mode Publik</span>
            <div class="toggle-switch" id="publicToggle" onclick="togglePublic()"></div>
        </div>
    </div>

    <!-- LEADERBOARD PAGE -->
    <div id="page-leaderboard" class="page">
        <h2 style="margin-bottom: 12px;">🏆 Top Kontributor</h2>
        <div id="leaderboardList"><div class="loading">Memuat...</div></div>
    </div>

    <!-- ADMIN PAGE -->
    <div id="page-admin" class="page">
        <div class="stats">
            <div class="stat-card"><div class="value" id="adminPending">0</div><div class="label">Pending</div></div>
            <div class="stat-card"><div class="value" id="adminApproved">0</div><div class="label">Approved</div></div>
            <div class="stat-card"><div class="value" id="adminRejected">0</div><div class="label">Rejected</div></div>
        </div>
        <h2 style="margin-bottom: 10px;">📥 Menunggu Moderasi</h2>
        <div id="adminPendingList"><div class="loading">Memuat...</div></div>
    </div>

    <!-- REJECT MODAL -->
    <div id="rejectModal" class="modal">
        <div class="modal-content">
            <h3>Pilih Alasan Penolakan</h3>
            <div id="rejectReasons"></div>
            <button class="modal-close" onclick="closeRejectModal()">Batal</button>
        </div>
    </div>

    <!-- TAB BAR -->
    <div class="tab-bar">
        <div class="tab active" onclick="switchTab('home')">🏠 Home</div>
        <div class="tab" onclick="switchTab('profile')">👤 Profile</div>
        <div class="tab" onclick="switchTab('leaderboard')">🏆 Ranking</div>
        <div class="tab" onclick="switchTab('admin')">⚙️ Admin</div>
    </div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();

        const API_URL = '{{ config("app.url") }}/api/webapp';
        let currentRejectAlbumId = null;

        async function apiFetch(endpoint) {
            const response = await fetch(`${API_URL}${endpoint}`, {
                headers: { 'X-Telegram-Init-Data': tg.initData }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }

        async function loadData() {
            try {
                const [statsData, profileData, leaderboardData, adminStatsData, adminPendingData] = await Promise.allSettled([
                    apiFetch('/stats'),
                    apiFetch('/profile'),
                    apiFetch('/leaderboard'),
                    apiFetch('/admin/stats'),
                    apiFetch('/admin/pending')
                ]);

                if (statsData.status === 'fulfilled') renderHome(statsData.value);
                if (profileData.status === 'fulfilled') renderProfile(profileData.value);
                if (leaderboardData.status === 'fulfilled') renderLeaderboard(leaderboardData.value);
                if (adminStatsData.status === 'fulfilled' && adminPendingData.status === 'fulfilled') {
                    renderAdmin(adminStatsData.value, adminPendingData.value);
                }
            } catch (err) {
                showError(err.message);
            }
        }

        function renderHome(data) {
            document.getElementById('albumCount').textContent = data.user?.album_count || 0;
            document.getElementById('downloadCount').textContent = data.user?.download_count || 0;
            document.getElementById('pendingCount').textContent = (data.albums || []).filter(a => a.status === 'pending').length;

            const albumsList = document.getElementById('albumsList');
            if (data.albums && data.albums.length > 0) {
                albumsList.innerHTML = data.albums.map(album => `
                    <div class="album-card">
                        <span class="status status-${album.status}">${getStatusLabel(album.status)}</span>
                        ${album.caption ? `<div class="caption">${escapeHtml(album.caption.substring(0, 100))}${album.caption.length > 100 ? '...' : ''}</div>` : ''}
                        <div class="meta">📅 ${formatDate(album.created_at)} | ⬇️ ${album.download_count}</div>
                        ${album.status === 'approved' ? `<button class="share-btn" onclick="shareAlbum('${album.id}')">📥 Bagikan</button>` : ''}
                        ${album.status === 'rejected' ? `<div class="meta">❌ ${album.reject_reason || '-'}</div>` : ''}
                    </div>
                `).join('');
            } else {
                albumsList.innerHTML = '<p style="color: var(--tg-theme-hint-color);">Belum ada album.</p>';
            }
        }

        function renderProfile(data) {
            document.getElementById('profileUserId').textContent = data.user?.user_id || '-';
            document.getElementById('profileUsername').textContent = data.user?.username || '(tidak ada)';
            document.getElementById('profileName').textContent = data.user?.full_name || '-';
            document.getElementById('profileAnon').textContent = data.user?.anonymous_id || '-';
            document.getElementById('profileAlbums').textContent = data.user?.album_count || 0;
            document.getElementById('profileDownloads').textContent = data.user?.download_count || 0;

            const toggle = document.getElementById('publicToggle');
            if (data.user?.is_public) toggle.classList.add('active');
            else toggle.classList.remove('active');
        }

        function renderLeaderboard(data) {
            const list = document.getElementById('leaderboardList');
            if (data.leaderboard && data.leaderboard.length > 0) {
                list.innerHTML = data.leaderboard.map((item, i) => `
                    <div class="leaderboard-item">
                        <div class="rank">${i + 1}</div>
                        <div class="info">
                            <div class="name">${item.anonymous_id}</div>
                            <div class="count">${item.album_count} album | ${item.download_count} download</div>
                        </div>
                    </div>
                `).join('');
            } else {
                list.innerHTML = '<p style="color: var(--tg-theme-hint-color);">Belum ada data.</p>';
            }
        }

        function renderAdmin(statsData, pendingData) {
            document.getElementById('adminPending').textContent = statsData.stats?.pending || 0;
            document.getElementById('adminApproved').textContent = statsData.stats?.approved || 0;
            document.getElementById('adminRejected').textContent = statsData.stats?.rejected || 0;

            const list = document.getElementById('adminPendingList');
            if (pendingData.albums && pendingData.albums.length > 0) {
                list.innerHTML = pendingData.albums.map(album => `
                    <div class="admin-card">
                        <div class="sender">🆔 ${album.sender.user_id} | 👤 ${album.sender.username || '(none)'} | 📛 ${album.sender.full_name}</div>
                        <div class="sender">🏷️ ${album.sender.anonymous_id}</div>
                        ${album.caption ? `<div class="caption">📝 "${escapeHtml(album.caption.substring(0, 80))}${album.caption.length > 80 ? '...' : ''}"</div>` : ''}
                        <div class="actions">
                            <button class="btn-approve" onclick="approveAlbum(${album.id})">✅ Setuju</button>
                            <button class="btn-reject" onclick="showRejectModal(${album.id})">❌ Tolak</button>
                        </div>
                    </div>
                `).join('');
            } else {
                list.innerHTML = '<p style="color: var(--tg-theme-hint-color);">Tidak ada album pending.</p>';
            }
        }

        async function togglePublic() {
            try {
                const data = await apiFetch('/toggle-public');
                const toggle = document.getElementById('publicToggle');
                toggle.classList.toggle('active');
                tg.showAlert(data.is_public ? 'Mode publik diaktifkan' : 'Mode publik dinonaktifkan');
            } catch (err) {
                tg.showAlert('Gagal mengubah mode');
            }
        }

        async function approveAlbum(id) {
            try {
                const data = await apiFetch(`/admin/approve/${id}`, { method: 'POST' });
                tg.showAlert('Album berhasil disetujui!');
                loadData();
            } catch (err) {
                tg.showAlert('Gagal menyetujui album');
            }
        }

        function showRejectModal(id) {
            currentRejectAlbumId = id;
            document.getElementById('rejectModal').classList.add('show');
            loadRejectReasons();
        }

        function closeRejectModal() {
            document.getElementById('rejectModal').classList.remove('show');
            currentRejectAlbumId = null;
        }

        async function loadRejectReasons() {
            try {
                const data = await apiFetch('/admin/reject-reasons');
                const container = document.getElementById('rejectReasons');
                container.innerHTML = Object.entries(data.reasons).map(([key, label]) =>
                    `<button class="reason-btn" onclick="rejectAlbum('${key}')">${label}</button>`
                ).join('');
            } catch (err) {}
        }

        async function rejectAlbum(reason) {
            if (!currentRejectAlbumId) return;
            try {
                await fetch(`${API_URL}/admin/reject/${currentRejectAlbumId}`, {
                    method: 'POST',
                    headers: { 'X-Telegram-Init-Data': tg.initData, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
                tg.showAlert('Album berhasil ditolak');
                closeRejectModal();
                loadData();
            } catch (err) {
                tg.showAlert('Gagal menolak album');
            }
        }

        function shareAlbum(id) {
            // Navigate to album detail and copy share link
            tg.showAlert('Link akan disalin ke clipboard');
        }

        function switchTab(tab) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(`page-${tab}`).classList.add('active');
            event.target.classList.add('active');
        }

        function getStatusLabel(status) {
            return { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' }[status] || status;
        }

        function formatDate(dateStr) {
            return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function showError(message) {
            const el = document.getElementById('error');
            el.textContent = message;
            el.style.display = 'block';
        }

        loadData();
    </script>
</body>
</html>