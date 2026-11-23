if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const DB_NAME = 'LocalPlayerDB_v2';
const STORE_NAME = 'tracks';
const PLAYLIST_STORE = 'playlists';

let db;
let tracks = [];
let playlists = [];
let queueIds = [];
let currentTrackId = null;
let activeContextLabel = '';

let currentAudioUrl = null;
let currentCoverUrl = null;
let thumbUrls = [];
let parsedLyrics = [];
let draggedIndex = null;

let searchQuery = '';
let activeFilter = 'all'; // 'all' | 'fav' | 'pl:<id>'
let activeTheme = localStorage.getItem('sopy_theme') || 'adaptive';
let isSyncMode = false;

let isShuffle = localStorage.getItem('sopy_shuffle') === 'true';
let isRepeatOne = localStorage.getItem('sopy_repeat') === 'true';

let editingTrackId = null;
let selectedAudioFile = null;
let selectedImageFile = null;
let managingPlaylistsForTrackId = null;
let fadeTimer = null;
let toastTimer = null;
let swapAnimTimer = null;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS) document.body.classList.add('is-ios');

let visStarted = false;

// Цвета визуализатора
const DEFAULT_VIS_COLORS = {
  top: 'rgba(142, 168, 255, 0.92)',
  bottom: 'rgba(165, 128, 240, 0.82)'
};
const MONO_VIS_COLORS = {
  top: 'rgba(245, 246, 250, 0.92)',
  bottom: 'rgba(155, 158, 168, 0.76)'
};
let visColors = { ...DEFAULT_VIS_COLORS };

// Web Audio API + Эквалайзер
let audioCtx = null;
let analyser = null;
let dataArray = null;
let bassFilter = null;
let midFilter = null;
let trebleFilter = null;

const EQ_PRESETS = {
  flat: [0, 0, 0],
  bass: [7, 1, 0],
  pop: [-1, 3, 4],
  rock: [5, -1, 5],
  vocal: [-2, 5, 2]
};

let eqValues = JSON.parse(localStorage.getItem('sopy_eq') || '[0,0,0]');

// Таймер сна
let sleepInterval = null;
let sleepEndTime = null;

// Элементы плеера
const audio = document.getElementById('audio');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const toastEl = document.getElementById('toast');
const trackListEl = document.getElementById('track-list');
const queueListEl = document.getElementById('queue-list');
const queueHintEl = document.getElementById('queue-hint');
const lyricsContentEl = document.getElementById('lyrics-content');
const libraryHeaderTitle = document.getElementById('library-header-title');
const deletePlaylistBtn = document.getElementById('delete-playlist-btn');
const trackCountEl = document.getElementById('track-count');
const coverImg = document.getElementById('cover-img');
const coverPlaceholder = document.getElementById('cover-placeholder');
const ambientImg = document.getElementById('ambient-img');
const mobileContextLabel = document.getElementById('mobile-context-label');
const currentContextBadge = document.getElementById('current-context-badge');
const currentTitleEl = document.getElementById('current-title');
const currentArtistEl = document.getElementById('current-artist');
const currentPlaylistBtn = document.getElementById('current-playlist-btn');
const currentFavBtn = document.getElementById('current-fav-btn');
const seekBar = document.getElementById('seek-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const playBtn = document.getElementById('play-btn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const skipBackBtn = document.getElementById('skip-back-btn');
const skipForwardBtn = document.getElementById('skip-forward-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const repeatLabel = document.getElementById('repeat-label');

// Поиск и лента плейлистов
const searchInput = document.getElementById('search-input');
const playlistBar = document.getElementById('playlist-bar');

// Мобильная навигация и мини-плеер
const mobileTabs = document.querySelectorAll('.mobile-tab');
const mobileAddBtn = document.getElementById('mobile-add-btn');
const miniPlayer = document.getElementById('mini-player');
const miniThumb = document.getElementById('mini-thumb');
const miniTitle = document.getElementById('mini-title');
const miniPlayBtn = document.getElementById('mini-play-btn');

// Громкость
const volumeBar = document.getElementById('volume-bar');
const volumePct = document.getElementById('volume-pct');
const muteBtn = document.getElementById('mute-btn');
const iconVol = document.getElementById('icon-vol');
const iconMute = document.getElementById('icon-mute');
let lastVolume = parseFloat(localStorage.getItem('player_volume') ?? '1');

// Вкладки правой панели
const tabQueue = document.getElementById('tab-queue');
const tabLyrics = document.getElementById('tab-lyrics');
const tabSound = document.getElementById('tab-sound');
const queueView = document.getElementById('queue-view');
const lyricsView = document.getElementById('lyrics-view');
const soundView = document.getElementById('sound-view');

// Текст, разметка и полный экран
const lyricsToolbar = document.getElementById('lyrics-toolbar');
const lyricsSyncModeBtn = document.getElementById('lyrics-sync-mode-btn');
const lyricsFullscreenBtn = document.getElementById('lyrics-fullscreen-btn');
const lyricsSyncPanel = document.getElementById('lyrics-sync-panel');
const stampLineBtn = document.getElementById('stamp-line-btn');
const clearStampsBtn = document.getElementById('clear-stamps-btn');

const lyricsFsModal = document.getElementById('lyrics-fullscreen-modal');
const fsLyricsTitle = document.getElementById('fs-lyrics-title');
const fsLyricsArtist = document.getElementById('fs-lyrics-artist');
const fsLyricsBody = document.getElementById('fs-lyrics-body');
const closeFsLyricsBtn = document.getElementById('close-fs-lyrics-btn');
const fsPrevBtn = document.getElementById('fs-prev-btn');
const fsPlayBtn = document.getElementById('fs-play-btn');
const fsNextBtn = document.getElementById('fs-next-btn');

// Темы, эквалайзер и таймер сна
const themeBtns = document.querySelectorAll('.theme-btn');
const eqBass = document.getElementById('eq-bass');
const eqMid = document.getElementById('eq-mid');
const eqTreble = document.getElementById('eq-treble');
const eqBassVal = document.getElementById('eq-bass-val');
const eqMidVal = document.getElementById('eq-mid-val');
const eqTrebleVal = document.getElementById('eq-treble-val');
const presetBtns = document.querySelectorAll('.preset-btn');
const sleepBtns = document.querySelectorAll('.sleep-btn');
const sleepStatusEl = document.getElementById('sleep-status');

// Статистика и бэкап
const totalPlaysBadge = document.getElementById('total-plays-badge');
const topTracksList = document.getElementById('top-tracks-list');
const exportBackupBtn = document.getElementById('export-backup-btn');
const importBackupInput = document.getElementById('import-backup-input');
const backupStatusEl = document.getElementById('backup-status');

// Модальное окно добавления/редактирования трека
const modal = document.getElementById('add-modal');
const modalTitle = document.getElementById('modal-title');
const audioPickerWrap = document.getElementById('audio-picker-wrap');
const openModalBtn = document.getElementById('open-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const saveTrackBtn = document.getElementById('save-track-btn');
const audioInput = document.getElementById('audio-input');
const imageInput = document.getElementById('image-input');
const audioLabel = document.getElementById('audio-label');
const imageLabel = document.getElementById('image-label');
const imagePreview = document.getElementById('image-preview');
const titleInput = document.getElementById('title-input');
const artistInput = document.getElementById('artist-input');
const lyricsInput = document.getElementById('lyrics-input');

// Модалки плейлистов
const playlistCreateModal = document.getElementById('playlist-create-modal');
const playlistNameInput = document.getElementById('playlist-name-input');
const cancelPlaylistCreateBtn = document.getElementById('cancel-playlist-create-btn');
const savePlaylistCreateBtn = document.getElementById('save-playlist-create-btn');

const trackPlaylistsModal = document.getElementById('track-playlists-modal');
const trackPlaylistsTitle = document.getElementById('track-playlists-title');
const trackPlaylistsList = document.getElementById('track-playlists-list');
const quickPlaylistInput = document.getElementById('quick-playlist-input');
const quickPlaylistAddBtn = document.getElementById('quick-playlist-add-btn');
const closeTrackPlaylistsBtn = document.getElementById('close-track-playlists-btn');

// Хелперы
function getTrackById(id) {
  return tracks.find((t) => t.id === id) || null;
}

function getActivePlaylist() {
  if (!activeFilter.startsWith('pl:')) return null;
  const id = parseInt(activeFilter.slice(3), 10);
  return playlists.find((p) => p.id === id) || null;
}

function isTrackInAnyPlaylist(trackId) {
  return playlists.some((p) => Array.isArray(p.trackIds) && p.trackIds.includes(trackId));
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2000);
}

function triggerTrackSwapAnimation() {
  const animatedEls = [coverImg, currentTitleEl, currentArtistEl];
  animatedEls.forEach((el) => el.classList.add('track-swap-fade'));
  clearTimeout(swapAnimTimer);
  swapAnimTimer = setTimeout(() => {
    animatedEls.forEach((el) => el.classList.remove('track-swap-fade'));
  }, 40);
}

function createPlayingBarsEl() {
  const bars = document.createElement('span');
  bars.className = 'now-playing-bars';
  bars.setAttribute('aria-hidden', 'true');
  bars.innerHTML = '<i></i><i></i><i></i>';
  return bars;
}

// ==================== ТЕМЫ ОФОРМЛЕНИЯ ====================
function applyTheme(themeName) {
  activeTheme = themeName;
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('sopy_theme', themeName);

  themeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });

  if (themeName === 'mono') {
    visColors = { ...MONO_VIS_COLORS };
  } else {
    extractVisualizerColors(currentCoverUrl);
  }
}

themeBtns.forEach((btn) => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// ==================== ИГРАТЬ СЛЕДУЮЩИМ В ОЧЕРЕДИ ====================
function playNextInQueue(trackId) {
  const track = getTrackById(trackId);
  if (!track) return;

  if (currentTrackId === null) {
    queueIds = [trackId];
    playTrackById(trackId);
    return;
  }

  if (trackId === currentTrackId) {
    showToast('Этот трек уже играет');
    return;
  }

  queueIds = queueIds.filter((id) => id !== trackId);
  const currentIdx = queueIds.indexOf(currentTrackId);
  if (currentIdx === -1) {
    queueIds.unshift(trackId);
  } else {
    queueIds.splice(currentIdx + 1, 0, trackId);
  }

  renderQueue();
  showToast(`Далее: ${track.name}`);
}

// ==================== ПАРСЕР ID3-ТЕГОВ ====================
async function parseAudioMetadata(file) {
  const result = { title: '', artist: '', coverFile: null };
  try {
    const slice = file.slice(0, Math.min(file.size, 1024 * 1024));
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);

    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const version = bytes[3];
      const tagSize =
        ((bytes[6] & 0x7f) << 21) |
        ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) |
        (bytes[9] & 0x7f);

      const end = Math.min(bytes.length, 10 + tagSize);
      let pos = 10;

      const decodeText = (enc, dataBytes) => {
        if (!dataBytes.length) return '';
        let charset = 'iso-8859-1';
        if (enc === 1 || enc === 2) charset = 'utf-16';
        else if (enc === 3) charset = 'utf-8';
        try {
          return new TextDecoder(charset).decode(dataBytes).replace(/\0/g, '').trim();
        } catch {
          return new TextDecoder('utf-8').decode(dataBytes).replace(/\0/g, '').trim();
        }
      };

      while (pos + 10 <= end) {
        const frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

        let frameSize = 0;
        if (version === 4) {
          frameSize =
            ((bytes[pos + 4] & 0x7f) << 21) |
            ((bytes[pos + 5] & 0x7f) << 14) |
            ((bytes[pos + 6] & 0x7f) << 7) |
            (bytes[pos + 7] & 0x7f);
        } else {
          frameSize =
            (bytes[pos + 4] << 24) |
            (bytes[pos + 5] << 16) |
            (bytes[pos + 6] << 8) |
            bytes[pos + 7];
        }

        if (frameSize <= 0 || pos + 10 + frameSize > end) break;
        const payload = bytes.subarray(pos + 10, pos + 10 + frameSize);

        if (frameId === 'TIT2' && payload.length > 1) {
          result.title = decodeText(payload[0], payload.subarray(1));
        } else if (frameId === 'TPE1' && payload.length > 1) {
          result.artist = decodeText(payload[0], payload.subarray(1));
        } else if (frameId === 'APIC' && payload.length > 4 && !result.coverFile) {
          const enc = payload[0];
          let idx = 1;
          let mime = '';
          while (idx < payload.length && payload[idx] !== 0) {
            mime += String.fromCharCode(payload[idx++]);
          }
          idx++;
          idx++;
          if (enc === 1 || enc === 2) {
            while (idx + 1 < payload.length && !(payload[idx] === 0 && payload[idx + 1] === 0)) idx += 2;
            idx += 2;
          } else {
            while (idx < payload.length && payload[idx] !== 0) idx++;
            idx++;
          }
          if (idx < payload.length) {
            const imgBytes = payload.subarray(idx);
            const cleanMime = mime && mime.startsWith('image/') ? mime : 'image/jpeg';
            result.coverFile = new File([imgBytes], 'cover.jpg', { type: cleanMime });
          }
        }

        pos += 10 + frameSize;
      }
    }

    if ((!result.title || !result.artist) && file.size >= 128) {
      const tailBuf = await file.slice(file.size - 128, file.size).arrayBuffer();
      const tail = new Uint8Array(tailBuf);
      if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
        const dec = new TextDecoder('utf-8');
        if (!result.title) {
          result.title = dec.decode(tail.subarray(3, 33)).replace(/\0/g, '').trim();
        }
        if (!result.artist) {
          result.artist = dec.decode(tail.subarray(33, 63)).replace(/\0/g, '').trim();
        }
      }
    }
  } catch {
    // Игнорируем неподдерживаемые теги
  }
  return result;
}

// ==================== ПЛАВНОЕ ЗАТУХАНИЕ ЗВУКА ====================
function fadeOutAndRun(callback, durationMs = 240) {
  clearInterval(fadeTimer);
  fadeTimer = null;

  if (isIOS || audio.paused || audio.volume <= 0.02) {
    callback();
    return;
  }

  const startVol = audio.volume;
  const steps = 10;
  const stepMs = Math.max(15, Math.floor(durationMs / steps));
  let step = 0;

  fadeTimer = setInterval(() => {
    step++;
    const nextVol = Math.max(0, startVol * (1 - step / steps));
    audio.volume = nextVol;
    if (step >= steps) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      callback();
      audio.volume = startVol;
    }
  }, stepMs);
}

// ==================== СТАТИСТИКА ПРОСЛУШИВАНИЙ ====================
function incrementPlayCount(trackId) {
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(trackId);
  req.onsuccess = () => {
    const rec = req.result;
    if (!rec) return;
    rec.playCount = (rec.playCount || 0) + 1;
    store.put(rec);
  };
  tx.oncomplete = () => {
    const localTrack = getTrackById(trackId);
    if (localTrack) localTrack.playCount = (localTrack.playCount || 0) + 1;
    renderStats();
  };
}

function renderStats() {
  const total = tracks.reduce((sum, t) => sum + (t.playCount || 0), 0);
  totalPlaysBadge.textContent = `${total} прослуш.`;

  const top = [...tracks]
    .filter((t) => (t.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 5);

  if (!top.length) {
    topTracksList.innerHTML = '<div class="sleep-status">Пока нет прослушиваний</div>';
    return;
  }

  topTracksList.innerHTML = '';
  top.forEach((t, idx) => {
    const row = document.createElement('div');
    row.className = 'top-track-row';
    row.onclick = () => playTrackById(t.id);

    const name = document.createElement('div');
    name.className = 'top-track-name';
    name.textContent = `${idx + 1}. ${t.name}`;

    const count = document.createElement('div');
    count.className = 'top-track-count';
    count.textContent = `${t.playCount}×`;

    row.append(name, count);
    topTracksList.appendChild(row);
  });
}

// ==================== ЭКСПОРТ / ИМПОРТ БЭКАПА ====================
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const res = await fetch(dataUrl);
  return await res.blob();
}

function showBackupStatus(text) {
  backupStatusEl.textContent = text;
  backupStatusEl.classList.remove('hidden');
}

exportBackupBtn.addEventListener('click', async () => {
  if (!tracks.length) {
    showBackupStatus('Медиатека пуста — нечего сохранять.');
    return;
  }
  try {
    showBackupStatus('Упаковка резервной копии...');
    const serializedTracks = [];
    for (const t of tracks) {
      serializedTracks.push({
        oldId: t.id,
        name: t.name,
        artist: t.artist || '',
        lyrics: t.lyrics || '',
        favorite: Boolean(t.favorite),
        playCount: t.playCount || 0,
        audioDataUrl: await blobToDataUrl(t.audioBlob),
        coverDataUrl: await blobToDataUrl(t.coverBlob)
      });
    }

    const payload = {
      app: 'Sopy',
      version: 1,
      exportedAt: new Date().toISOString(),
      tracks: serializedTracks,
      playlists: playlists.map((p) => ({
        name: p.name,
        trackIds: Array.isArray(p.trackIds) ? p.trackIds : []
      }))
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sopy-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showBackupStatus(`Сохранено треков: ${serializedTracks.length}`);
  } catch {
    showBackupStatus('Не удалось создать резервную копию.');
  }
});

importBackupInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    showBackupStatus('Восстановление треков...');
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || data.app !== 'Sopy' || !Array.isArray(data.tracks)) {
      showBackupStatus('Неверный формат файла бэкапа.');
      return;
    }

    const idMap = new Map();
    let importedCount = 0;

    for (const item of data.tracks) {
      if (!item.audioDataUrl) continue;
      const existing = tracks.find(
        (t) => t.name === item.name && (t.artist || '') === (item.artist || '')
      );
      if (existing) {
        idMap.set(item.oldId, existing.id);
        continue;
      }

      const audioBlob = await dataUrlToBlob(item.audioDataUrl);
      const coverBlob = await dataUrlToBlob(item.coverDataUrl);

      const newId = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).add({
          name: item.name || 'Без названия',
          artist: item.artist || '',
          lyrics: item.lyrics || '',
          favorite: Boolean(item.favorite),
          playCount: item.playCount || 0,
          audioBlob,
          coverBlob
        });
        req.onsuccess = (ev) => resolve(ev.target.result);
      });

      idMap.set(item.oldId, newId);
      importedCount++;
    }

    if (Array.isArray(data.playlists)) {
      for (const pl of data.playlists) {
        const mappedIds = (pl.trackIds || [])
          .map((oldId) => idMap.get(oldId))
          .filter(Boolean);
        if (!mappedIds.length && !pl.name) continue;

        await new Promise((resolve) => {
          const tx = db.transaction(PLAYLIST_STORE, 'readwrite');
          tx.objectStore(PLAYLIST_STORE).add({
            name: pl.name || 'Плейлист',
            trackIds: mappedIds
          });
          tx.oncomplete = resolve;
        });
      }
    }

    reloadData();
    showBackupStatus(`Восстановлено новых треков: ${importedCount}`);
  } catch {
    showBackupStatus('Ошибка при чтении файла бэкапа.');
  }
});

// Перемешать и Повтор трека
function updateModeUI() {
  shuffleBtn.classList.toggle('active', isShuffle);
  repeatBtn.classList.toggle('active', isRepeatOne);
  repeatLabel.textContent = isRepeatOne ? 'Повтор 1' : 'Повтор';
}

shuffleBtn.addEventListener('click', () => {
  isShuffle = !isShuffle;
  localStorage.setItem('sopy_shuffle', String(isShuffle));
  updateModeUI();
});

repeatBtn.addEventListener('click', () => {
  isRepeatOne = !isRepeatOne;
  localStorage.setItem('sopy_repeat', String(isRepeatOne));
  updateModeUI();
});

// Переключение мобильных вкладок
function setMobileTab(tabName) {
  document.body.setAttribute('data-mobile-tab', tabName);
  mobileTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === tabName);
  });
}

mobileTabs.forEach((btn) => {
  btn.addEventListener('click', () => setMobileTab(btn.dataset.target));
});

miniPlayer.addEventListener('click', () => setMobileTab('player'));
miniPlayBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playBtn.click();
});

// Поиск
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  renderTracks();
});

// Вкладки правой панели
function setRightTab(tab) {
  tabQueue.classList.toggle('active', tab === 'queue');
  tabLyrics.classList.toggle('active', tab === 'lyrics');
  tabSound.classList.toggle('active', tab === 'sound');
  queueView.classList.toggle('hidden', tab !== 'queue');
  lyricsView.classList.toggle('hidden', tab !== 'lyrics');
  soundView.classList.toggle('hidden', tab !== 'sound');
}

tabQueue.addEventListener('click', () => setRightTab('queue'));
tabLyrics.addEventListener('click', () => setRightTab('lyrics'));
tabSound.addEventListener('click', () => setRightTab('sound'));

// Эквалайзер
function formatDb(v) {
  return `${v > 0 ? '+' : ''}${v} дБ`;
}

function applyEQ() {
  const [bass, mid, treble] = eqValues;
  eqBass.value = bass;
  eqMid.value = mid;
  eqTreble.value = treble;
  eqBassVal.textContent = formatDb(bass);
  eqMidVal.textContent = formatDb(mid);
  eqTrebleVal.textContent = formatDb(treble);

  if (bassFilter) bassFilter.gain.value = bass;
  if (midFilter) midFilter.gain.value = mid;
  if (trebleFilter) trebleFilter.gain.value = treble;

  localStorage.setItem('sopy_eq', JSON.stringify(eqValues));

  presetBtns.forEach((btn) => {
    const p = EQ_PRESETS[btn.dataset.preset];
    const match = p && p[0] === bass && p[1] === mid && p[2] === treble;
    btn.classList.toggle('active', match);
  });
}

presetBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    eqValues = [...EQ_PRESETS[btn.dataset.preset]];
    applyEQ();
  });
});

[eqBass, eqMid, eqTreble].forEach((slider, idx) => {
  slider.addEventListener('input', () => {
    eqValues[idx] = parseInt(slider.value, 10);
    applyEQ();
  });
});

// Таймер сна
function setSleepTimer(minutes) {
  clearInterval(sleepInterval);
  sleepInterval = null;
  sleepEndTime = null;

  sleepBtns.forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.min, 10) === minutes);
  });

  if (minutes === 0) {
    sleepStatusEl.textContent = 'Выключен';
    return;
  }

  sleepEndTime = Date.now() + minutes * 60 * 1000;
  updateSleepCountdown();
  sleepInterval = setInterval(updateSleepCountdown, 1000);
}

function updateSleepCountdown() {
  const diff = Math.max(0, Math.ceil((sleepEndTime - Date.now()) / 1000));
  if (diff <= 0) {
    fadeOutAndRun(() => {
      audio.pause();
      setPlayingState(false);
    }, 600);
    setSleepTimer(0);
    return;
  }
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  sleepStatusEl.textContent = `Пауза через ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

sleepBtns.forEach((btn) => {
  btn.addEventListener('click', () => setSleepTimer(parseInt(btn.dataset.min, 10)));
});

// Цвета визуализатора
function extractVisualizerColors(imgUrl) {
  if (activeTheme === 'mono') {
    visColors = { ...MONO_VIS_COLORS };
    return;
  }
  if (!imgUrl) {
    visColors = { ...DEFAULT_VIS_COLORS };
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (activeTheme === 'mono') {
      visColors = { ...MONO_VIS_COLORS };
      return;
    }
    const offscreen = document.createElement('canvas');
    const size = 24;
    offscreen.width = size;
    offscreen.height = size;
    const octx = offscreen.getContext('2d');
    octx.drawImage(img, 0, 0, size, size);

    const { data } = octx.getImageData(0, 0, size, size);
    let r1 = 0, g1 = 0, b1 = 0, c1 = 0;
    let r2 = 0, g2 = 0, b2 = 0, c2 = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (y < size / 2) {
          r1 += data[i]; g1 += data[i + 1]; b1 += data[i + 2]; c1++;
        } else {
          r2 += data[i]; g2 += data[i + 1]; b2 += data[i + 2]; c2++;
        }
      }
    }

    const lift = (val, minVal) => Math.max(minVal, Math.min(255, Math.round(val * 1.1 + 45)));
    visColors = {
      top: `rgba(${lift(r1 / c1, 130)}, ${lift(g1 / c1, 130)}, ${lift(b1 / c1, 130)}, 0.92)`,
      bottom: `rgba(${lift(r2 / c2, 95)}, ${lift(g2 / c2, 95)}, ${lift(b2 / c2, 95)}, 0.82)`
    };
  };
  img.src = imgUrl;
}

// Визуализатор + эквалайзер (с обходом Web Audio на iOS для фонового звука)
function initVisualizer() {
  if (isIOS) {
    if (!visStarted) {
      visStarted = true;
      drawVisualizer();
    }
    return;
  }

  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  audioCtx = new AudioContextClass();
  const source = audioCtx.createMediaElementSource(audio);

  bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = 'lowshelf';
  bassFilter.frequency.value = 200;

  midFilter = audioCtx.createBiquadFilter();
  midFilter.type = 'peaking';
  midFilter.frequency.value = 1000;
  midFilter.Q.value = 1;

  trebleFilter = audioCtx.createBiquadFilter();
  trebleFilter.type = 'highshelf';
  trebleFilter.frequency.value = 3000;

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;

  source.connect(bassFilter);
  bassFilter.connect(midFilter);
  midFilter.connect(trebleFilter);
  trebleFilter.connect(analyser);
  analyser.connect(audioCtx.destination);

  applyEQ();
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  if (!visStarted) {
    visStarted = true;
    drawVisualizer();
  }
}

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const barCount = 24;
  const gap = 5;
  const barWidth = (canvas.width - gap * (barCount - 1)) / barCount;

  if (analyser && !audio.paused) {
    analyser.getByteFrequencyData(dataArray);
  }

  const t = Date.now() / 220;

  for (let i = 0; i < barCount; i++) {
    let val = 16;
    if (!audio.paused) {
      if (analyser) {
        val = dataArray[i];
      } else if (isIOS) {
        val = 48 + Math.abs(Math.sin(t + i * 0.45) * Math.cos(t * 0.6 + i * 0.2)) * 165;
      }
    }

    const height = Math.max(4, (val / 255) * (canvas.height - 4));
    const x = i * (barWidth + gap);
    const y = (canvas.height - height) / 2;

    const grad = ctx.createLinearGradient(0, y, 0, y + height);
    grad.addColorStop(0, visColors.top);
    grad.addColorStop(1, visColors.bottom);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, height, 3);
    ctx.fill();
  }
}

// IndexedDB (v2: tracks + playlists)
function initDB() {
  const req = indexedDB.open(DB_NAME, 2);
  req.onupgradeneeded = (e) => {
    const database = e.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
    if (!database.objectStoreNames.contains(PLAYLIST_STORE)) {
      database.createObjectStore(PLAYLIST_STORE, { keyPath: 'id', autoIncrement: true });
    }
  };
  req.onsuccess = (e) => {
    db = e.target.result;
    reloadData();
  };
}

function reloadData() {
  const tx = db.transaction([STORE_NAME, PLAYLIST_STORE], 'readonly');
  const tracksReq = tx.objectStore(STORE_NAME).getAll();
  const playlistsReq = tx.objectStore(PLAYLIST_STORE).getAll();

  tx.oncomplete = () => {
    tracks = tracksReq.result || [];
    playlists = playlistsReq.result || [];

    if (activeFilter.startsWith('pl:') && !getActivePlaylist()) {
      activeFilter = 'all';
    }

    const validIds = new Set(tracks.map((t) => t.id));
    queueIds = queueIds.filter((id) => validIds.has(id));
    if (!queueIds.length && tracks.length) {
      queueIds = tracks.map((t) => t.id);
    }

    renderPlaylistBar();
    renderTracks();
    renderQueue();
    renderStats();
    updateCurrentActionsUI();
  };
}

// ==================== ПЛЕЙЛИСТЫ ====================
function renderPlaylistBar() {
  playlistBar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'pill-btn' + (activeFilter === 'all' ? ' active' : '');
  allBtn.textContent = 'Все';
  allBtn.onclick = () => {
    activeFilter = 'all';
    renderPlaylistBar();
    renderTracks();
  };

  const favBtn = document.createElement('button');
  favBtn.className = 'pill-btn' + (activeFilter === 'fav' ? ' active' : '');
  favBtn.textContent = '♥ Избранное';
  favBtn.onclick = () => {
    activeFilter = 'fav';
    renderPlaylistBar();
    renderTracks();
  };

  playlistBar.append(allBtn, favBtn);

  playlists.forEach((pl) => {
    const key = `pl:${pl.id}`;
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (activeFilter === key ? ' active' : '');
    btn.textContent = pl.name;
    btn.onclick = () => {
      activeFilter = key;
      renderPlaylistBar();
      renderTracks();
    };
    playlistBar.appendChild(btn);
  });

  const createBtn = document.createElement('button');
  createBtn.className = 'pill-btn create-pl-btn';
  createBtn.textContent = '+ Плейлист';
  createBtn.onclick = openCreatePlaylistModal;
  playlistBar.appendChild(createBtn);
}

function openCreatePlaylistModal() {
  playlistNameInput.value = '';
  playlistCreateModal.classList.remove('hidden');
  setTimeout(() => playlistNameInput.focus(), 50);
}

function closeCreatePlaylistModal() {
  playlistCreateModal.classList.add('hidden');
}

function createPlaylist(name) {
  const clean = name.trim();
  if (!clean) return;
  const tx = db.transaction(PLAYLIST_STORE, 'readwrite');
  const req = tx.objectStore(PLAYLIST_STORE).add({ name: clean, trackIds: [] });
  req.onsuccess = (e) => {
    activeFilter = `pl:${e.target.result}`;
  };
  tx.oncomplete = () => {
    closeCreatePlaylistModal();
    reloadData();
  };
}

cancelPlaylistCreateBtn.addEventListener('click', closeCreatePlaylistModal);
playlistCreateModal.addEventListener('click', (e) => {
  if (e.target === playlistCreateModal) closeCreatePlaylistModal();
});
savePlaylistCreateBtn.addEventListener('click', () => createPlaylist(playlistNameInput.value));
playlistNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createPlaylist(playlistNameInput.value);
});

deletePlaylistBtn.addEventListener('click', () => {
  const pl = getActivePlaylist();
  if (!pl) return;
  if (!confirm(`Удалить плейлист «${pl.name}»? Сами треки останутся в медиатеке.`)) return;

  const tx = db.transaction(PLAYLIST_STORE, 'readwrite');
  tx.objectStore(PLAYLIST_STORE).delete(pl.id);
  tx.oncomplete = () => {
    activeFilter = 'all';
    reloadData();
  };
});

function openTrackPlaylistsModal(trackId) {
  const track = getTrackById(trackId);
  if (!track) return;
  managingPlaylistsForTrackId = trackId;
  trackPlaylistsTitle.textContent = `«${track.name}» в плейлистах`;
  quickPlaylistInput.value = '';
  renderTrackPlaylistsCheckList();
  trackPlaylistsModal.classList.remove('hidden');
}

function closeTrackPlaylistsModal() {
  trackPlaylistsModal.classList.add('hidden');
  managingPlaylistsForTrackId = null;
}

function renderTrackPlaylistsCheckList() {
  if (managingPlaylistsForTrackId === null) return;
  if (!playlists.length) {
    trackPlaylistsList.innerHTML = '<div class="empty-list" style="padding:14px;">Плейлистов пока нет — создайте первый ниже</div>';
    return;
  }

  trackPlaylistsList.innerHTML = '';
  playlists.forEach((pl) => {
    const ids = Array.isArray(pl.trackIds) ? pl.trackIds : [];
    const checked = ids.includes(managingPlaylistsForTrackId);

    const row = document.createElement('div');
    row.className = 'playlist-check-item' + (checked ? ' checked' : '');
    row.onclick = () => toggleTrackInPlaylist(pl.id, managingPlaylistsForTrackId);

    const left = document.createElement('div');
    left.className = 'playlist-check-left';

    const name = document.createElement('div');
    name.className = 'playlist-check-name';
    name.textContent = pl.name;

    const count = document.createElement('div');
    count.className = 'playlist-check-count';
    count.textContent = `${ids.length} трек(ов)`;

    left.append(name, count);

    const mark = document.createElement('div');
    mark.className = 'playlist-check-mark';
    mark.textContent = checked ? '✓' : '';

    row.append(left, mark);
    trackPlaylistsList.appendChild(row);
  });
}

function toggleTrackInPlaylist(playlistId, trackId) {
  const tx = db.transaction(PLAYLIST_STORE, 'readwrite');
  const store = tx.objectStore(PLAYLIST_STORE);
  const req = store.get(playlistId);
  req.onsuccess = () => {
    const pl = req.result;
    if (!pl) return;
    pl.trackIds = Array.isArray(pl.trackIds) ? pl.trackIds : [];
    const idx = pl.trackIds.indexOf(trackId);
    if (idx === -1) {
      pl.trackIds.push(trackId);
    } else {
      pl.trackIds.splice(idx, 1);
    }
    store.put(pl);
  };
  tx.oncomplete = () => {
    reloadData();
    setTimeout(renderTrackPlaylistsCheckList, 20);
  };
}

quickPlaylistAddBtn.addEventListener('click', () => {
  const clean = quickPlaylistInput.value.trim();
  if (!clean || managingPlaylistsForTrackId === null) return;
  const trackIdToInclude = managingPlaylistsForTrackId;

  const tx = db.transaction(PLAYLIST_STORE, 'readwrite');
  tx.objectStore(PLAYLIST_STORE).add({ name: clean, trackIds: [trackIdToInclude] });
  tx.oncomplete = () => {
    quickPlaylistInput.value = '';
    reloadData();
    setTimeout(renderTrackPlaylistsCheckList, 20);
  };
});

closeTrackPlaylistsBtn.addEventListener('click', closeTrackPlaylistsModal);
trackPlaylistsModal.addEventListener('click', (e) => {
  if (e.target === trackPlaylistsModal) closeTrackPlaylistsModal();
});

// ==================== ИЗБРАННОЕ И КНОПКИ ПЛЕЕРА ====================
function toggleFavorite(trackId, e) {
  if (e) e.stopPropagation();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(trackId);
  req.onsuccess = () => {
    const rec = req.result;
    if (!rec) return;
    rec.favorite = !rec.favorite;
    store.put(rec);
  };
  tx.oncomplete = () => reloadData();
}

function updateCurrentActionsUI() {
  const track = currentTrackId !== null ? getTrackById(currentTrackId) : null;
  const isFav = Boolean(track && track.favorite);
  currentFavBtn.classList.toggle('is-fav', isFav);
  currentFavBtn.textContent = isFav ? '♥' : '♡';

  const inPl = track ? isTrackInAnyPlaylist(track.id) : false;
  currentPlaylistBtn.classList.toggle('in-pl', inPl);
}

currentFavBtn.addEventListener('click', () => {
  if (currentTrackId === null) return;
  toggleFavorite(currentTrackId);
});

currentPlaylistBtn.addEventListener('click', () => {
  if (currentTrackId === null) return;
  openTrackPlaylistsModal(currentTrackId);
});

// ==================== ОТРИСОВКА СПИСКОВ ====================
function createThumbEl(track) {
  const thumb = document.createElement('div');
  thumb.className = 'track-thumb';
  if (track.coverBlob) {
    const url = URL.createObjectURL(track.coverBlob);
    thumbUrls.push(url);
    const img = document.createElement('img');
    img.src = url;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    thumb.appendChild(img);
  } else {
    thumb.textContent = '♪';
  }
  return thumb;
}

function createTrackInfoEl(track, isActive = false) {
  const info = document.createElement('div');
  info.className = 'track-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'track-item-name';

  const nameText = document.createElement('span');
  nameText.className = 'track-name-text';
  nameText.textContent = track.name;
  nameRow.appendChild(nameText);

  if (isActive) {
    nameRow.appendChild(createPlayingBarsEl());
  }

  info.appendChild(nameRow);

  if (track.artist) {
    const artist = document.createElement('div');
    artist.className = 'track-item-artist';
    artist.textContent = track.artist;
    info.appendChild(artist);
  }

  return info;
}

function getFilteredTracks() {
  const activePl = getActivePlaylist();
  let baseList = tracks;

  if (activeFilter === 'fav') {
    baseList = tracks.filter((t) => t.favorite);
  } else if (activePl) {
    const ids = Array.isArray(activePl.trackIds) ? activePl.trackIds : [];
    baseList = ids.map((id) => getTrackById(id)).filter(Boolean);
  }

  if (!searchQuery) return baseList;
  return baseList.filter((t) => `${t.name} ${t.artist || ''}`.toLowerCase().includes(searchQuery));
}

function getCurrentContextName() {
  const activePl = getActivePlaylist();
  if (activePl) return activePl.name;
  if (activeFilter === 'fav') return 'Избранное';
  return '';
}

function renderTracks() {
  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls = [];

  const activePl = getActivePlaylist();
  libraryHeaderTitle.textContent = activePl ? activePl.name : (activeFilter === 'fav' ? 'Избранное' : 'Медиатека');
  deletePlaylistBtn.classList.toggle('hidden', !activePl);

  const visibleTracks = getFilteredTracks();
  trackCountEl.textContent = visibleTracks.length;

  if (!visibleTracks.length) {
    let emptyMsg = 'Нет треков';
    if (searchQuery) emptyMsg = 'Ничего не найдено';
    else if (activePl) emptyMsg = 'Плейлист пуст. Нажмите ☰ на треке, чтобы добавить его сюда.';
    else if (activeFilter === 'fav') emptyMsg = 'В избранном пока пусто';
    trackListEl.innerHTML = `<div class="empty-list">${emptyMsg}</div>`;
    return;
  }

  trackListEl.innerHTML = '';
  visibleTracks.forEach((track) => {
    const isActive = track.id === currentTrackId;
    const item = document.createElement('div');
    item.className = 'track-item' + (isActive ? ' active' : '');
    item.onclick = () => {
      queueIds = visibleTracks.map((t) => t.id);
      activeContextLabel = getCurrentContextName();
      playTrackById(track.id);
      if (window.innerWidth <= 820 || window.innerHeight <= 520) setMobileTab('player');
    };

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openModal(track);
    });

    const thumb = createThumbEl(track);
    const info = createTrackInfoEl(track, isActive);

    const actions = document.createElement('div');
    actions.className = 'track-actions';

    const nextInQBtn = document.createElement('button');
    nextInQBtn.className = 'icon-action-btn';
    nextInQBtn.textContent = '↷';
    nextInQBtn.title = 'Играть следующим';
    nextInQBtn.onclick = (e) => {
      e.stopPropagation();
      playNextInQueue(track.id);
    };

    const plBtn = document.createElement('button');
    plBtn.className = 'icon-action-btn' + (isTrackInAnyPlaylist(track.id) ? ' in-pl' : '');
    plBtn.textContent = '☰';
    plBtn.title = 'Добавить в плейлист';
    plBtn.onclick = (e) => {
      e.stopPropagation();
      openTrackPlaylistsModal(track.id);
    };

    const fav = document.createElement('button');
    fav.className = 'icon-action-btn fav' + (track.favorite ? ' is-fav' : '');
    fav.textContent = track.favorite ? '♥' : '♡';
    fav.title = 'Избранное';
    fav.onclick = (e) => toggleFavorite(track.id, e);

    const edit = document.createElement('button');
    edit.className = 'icon-action-btn';
    edit.textContent = '✎';
    edit.title = 'Редактировать';
    edit.onclick = (e) => {
      e.stopPropagation();
      openModal(track);
    };

    const del = document.createElement('button');
    del.className = 'icon-action-btn delete';
    del.textContent = activePl ? '−' : '✕';
    del.title = activePl ? 'Убрать из плейлиста' : 'Удалить трек';
    del.onclick = (e) => {
      e.stopPropagation();
      if (activePl) {
        toggleTrackInPlaylist(activePl.id, track.id);
      } else {
        deleteTrack(track.id);
      }
    };

    actions.append(nextInQBtn, plBtn, fav, edit, del);
    item.append(thumb, info, actions);
    trackListEl.appendChild(item);
  });
}

// Очередь с перетаскиванием
function renderQueue() {
  const queueTracks = queueIds.map((id) => getTrackById(id)).filter(Boolean);
  queueHintEl.textContent = activeContextLabel
    ? `Играет: ${activeContextLabel}`
    : 'Перетаскивайте треки для изменения порядка';

  if (!queueTracks.length) {
    queueListEl.innerHTML = '<div class="empty-list">Очередь пуста</div>';
    return;
  }

  queueListEl.innerHTML = '';
  queueTracks.forEach((track, idx) => {
    const isActive = track.id === currentTrackId;
    const item = document.createElement('div');
    item.className = 'track-item' + (isActive ? ' active' : '');
    item.draggable = true;

    item.addEventListener('dragstart', () => {
      draggedIndex = idx;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedIndex = null;
    });

    item.addEventListener('dragover', (e) => e.preventDefault());

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === idx) return;

      const [movedId] = queueIds.splice(draggedIndex, 1);
      queueIds.splice(idx, 0, movedId);
      renderQueue();
    });

    item.onclick = () => playTrackById(track.id);

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';

    const thumb = createThumbEl(track);
    const info = createTrackInfoEl(track, isActive);

    item.append(handle, thumb, info);
    queueListEl.appendChild(item);
  });
}

// ==================== ТЕКСТ ПЕСНИ, РАЗМЕТКА И ПОЛНЫЙ ЭКРАН ====================
function formatTimestamp(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

function saveLyricsForCurrentTrack(newLyricsText) {
  if (currentTrackId === null || !db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(currentTrackId);
  req.onsuccess = () => {
    const rec = req.result;
    if (!rec) return;
    rec.lyrics = newLyricsText;
    store.put(rec);
  };
  tx.oncomplete = () => {
    const local = getTrackById(currentTrackId);
    if (local) local.lyrics = newLyricsText;
    renderLyrics(newLyricsText);
  };
}

function getNextUnstampedIndex() {
  return parsedLyrics.findIndex((line) => line.time === null);
}

function updateStampButtonUI() {
  if (!isSyncMode) return;
  const nextIdx = getNextUnstampedIndex();
  if (nextIdx === -1) {
    stampLineBtn.textContent = 'Все строчки размечены ✓';
  } else {
    stampLineBtn.textContent = `Метка [${formatTime(audio.currentTime)}] → стр. ${nextIdx + 1}`;
  }
}

function stampLineAtIndex(targetIdx) {
  if (targetIdx < 0 || targetIdx >= parsedLyrics.length) return;
  const stamp = formatTimestamp(audio.currentTime || 0);
  parsedLyrics[targetIdx].time = audio.currentTime || 0;

  const rebuilt = parsedLyrics
    .map((line, i) => {
      if (i === targetIdx) return `[${stamp}] ${line.text}`;
      if (line.time !== null) return `[${formatTimestamp(line.time)}] ${line.text}`;
      return line.text;
    })
    .join('\n');

  saveLyricsForCurrentTrack(rebuilt);
}

lyricsSyncModeBtn.addEventListener('click', () => {
  isSyncMode = !isSyncMode;
  lyricsSyncModeBtn.classList.toggle('active', isSyncMode);
  lyricsSyncPanel.classList.toggle('hidden', !isSyncMode);
  const track = currentTrackId !== null ? getTrackById(currentTrackId) : null;
  renderLyrics(track ? track.lyrics || '' : '');
});

stampLineBtn.addEventListener('click', () => {
  const nextIdx = getNextUnstampedIndex();
  if (nextIdx !== -1) {
    stampLineAtIndex(nextIdx);
  }
});

clearStampsBtn.addEventListener('click', () => {
  if (!parsedLyrics.length) return;
  const plain = parsedLyrics.map((l) => l.text).join('\n');
  saveLyricsForCurrentTrack(plain);
  showToast('Таймкоды сброшены');
});

function renderLyrics(lyricsText) {
  parsedLyrics = [];
  fsLyricsBody.innerHTML = '';

  if (!lyricsText || !lyricsText.trim()) {
    lyricsToolbar.classList.add('hidden');
    lyricsSyncPanel.classList.add('hidden');
    isSyncMode = false;
    lyricsSyncModeBtn.classList.remove('active');
    lyricsContentEl.innerHTML = '<div class="empty-list">Текст не добавлен. Нажмите ✎ на треке, чтобы вставить текст.</div>';
    fsLyricsBody.innerHTML = '<div class="empty-list">Текст не добавлен</div>';
    return;
  }

  lyricsToolbar.classList.remove('hidden');

  const lines = lyricsText.split('\n');
  const timeRegex = /\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]\s*(.*)/;

  lyricsContentEl.innerHTML = '';
  lines.forEach((rawLine) => {
    const match = rawLine.match(timeRegex);
    const lineObj = match
      ? { time: parseInt(match[1], 10) * 60 + parseFloat(match[2]), text: match[3] }
      : { time: null, text: rawLine };

    if (!lineObj.text.trim()) return;
    const idx = parsedLyrics.length;

    const div = document.createElement('div');
    div.className = 'lyric-line';

    if (lineObj.time !== null) {
      const tag = document.createElement('span');
      tag.className = 'lyric-stamp-tag';
      tag.textContent = formatTime(lineObj.time);
      div.appendChild(tag);
    }

    const span = document.createElement('span');
    span.textContent = lineObj.text;
    div.appendChild(span);

    div.onclick = () => {
      if (isSyncMode) {
        stampLineAtIndex(idx);
        return;
      }
      if (lineObj.time !== null && audio.src) {
        audio.currentTime = lineObj.time;
        audio.play();
        setPlayingState(true);
      }
    };

    const fsDiv = document.createElement('div');
    fsDiv.className = 'fs-lyric-line';
    fsDiv.textContent = lineObj.text;
    if (lineObj.time !== null) {
      fsDiv.onclick = () => {
        if (audio.src) {
          audio.currentTime = lineObj.time;
          audio.play();
          setPlayingState(true);
        }
      };
    }

    lineObj.el = div;
    lineObj.fsEl = fsDiv;
    parsedLyrics.push(lineObj);
    lyricsContentEl.appendChild(div);
    fsLyricsBody.appendChild(fsDiv);
  });

  if (isSyncMode) {
    const nextIdx = getNextUnstampedIndex();
    if (nextIdx !== -1 && parsedLyrics[nextIdx]) {
      parsedLyrics[nextIdx].el.classList.add('next-to-stamp');
    }
    updateStampButtonUI();
  }
}

function syncLyrics(currentTime) {
  if (isSyncMode) updateStampButtonUI();
  if (!parsedLyrics.length) return;

  let activeIdx = -1;
  for (let i = 0; i < parsedLyrics.length; i++) {
    if (parsedLyrics[i].time !== null && currentTime >= parsedLyrics[i].time) {
      activeIdx = i;
    }
  }
  parsedLyrics.forEach((line, i) => {
    const isActive = i === activeIdx;
    if (isActive && !line.el.classList.contains('active')) {
      line.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!lyricsFsModal.classList.contains('hidden') && line.fsEl) {
        line.fsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    line.el.classList.toggle('active', isActive);
    if (line.fsEl) line.fsEl.classList.toggle('active', isActive);
  });
}

lyricsFullscreenBtn.addEventListener('click', () => {
  const track = currentTrackId !== null ? getTrackById(currentTrackId) : null;
  fsLyricsTitle.textContent = track ? track.name : 'Выберите трек';
  fsLyricsArtist.textContent = track && track.artist ? track.artist : '';
  lyricsFsModal.classList.remove('hidden');
});

closeFsLyricsBtn.addEventListener('click', () => {
  lyricsFsModal.classList.add('hidden');
});

fsPlayBtn.addEventListener('click', () => playBtn.click());
fsPrevBtn.addEventListener('click', () => prevBtn.click());
fsNextBtn.addEventListener('click', () => nextBtn.click());

function deleteTrack(id) {
  if (id === currentTrackId) {
    audio.pause();
    audio.src = '';
    currentTrackId = null;
    resetPlayerUI();
  }

  const tx = db.transaction([STORE_NAME, PLAYLIST_STORE], 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);

  const plStore = tx.objectStore(PLAYLIST_STORE);
  const plReq = plStore.getAll();
  plReq.onsuccess = () => {
    (plReq.result || []).forEach((pl) => {
      if (Array.isArray(pl.trackIds) && pl.trackIds.includes(id)) {
        pl.trackIds = pl.trackIds.filter((tid) => tid !== id);
        plStore.put(pl);
      }
    });
  };

  tx.oncomplete = () => reloadData();
}

function setPlayingState(playing) {
  document.body.classList.toggle('is-playing', playing);
  iconPlay.classList.toggle('hidden', playing);
  iconPause.classList.toggle('hidden', !playing);
  miniPlayBtn.textContent = playing ? '❚❚' : '▶';
  fsPlayBtn.textContent = playing ? '❚❚' : '▶';
}

function updateSeekVisual() {
  const max = parseFloat(seekBar.max) || 100;
  const val = parseFloat(seekBar.value) || 0;
  seekBar.style.setProperty('--progress', `${(val / max) * 100}%`);
}

function applyArtistToUI(artist) {
  if (artist && artist.trim()) {
    currentArtistEl.textContent = artist.trim();
    currentArtistEl.classList.remove('hidden');
  } else {
    currentArtistEl.textContent = '';
    currentArtistEl.classList.add('hidden');
  }
}

function applyContextBadgeUI() {
  if (mobileContextLabel) {
    mobileContextLabel.textContent = activeContextLabel || 'Все треки';
  }

  if (activeContextLabel) {
    currentContextBadge.textContent = `Плейлист · ${activeContextLabel}`;
    currentContextBadge.classList.remove('hidden');
  } else {
    currentContextBadge.textContent = '';
    currentContextBadge.classList.add('hidden');
  }
}

function applyCoverToUI(coverBlob) {
  if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl);
  if (coverBlob) {
    currentCoverUrl = URL.createObjectURL(coverBlob);
    coverImg.src = currentCoverUrl;
    coverImg.classList.remove('hidden');
    coverPlaceholder.classList.add('hidden');
    ambientImg.src = currentCoverUrl;
    ambientImg.classList.remove('hidden');
    miniThumb.innerHTML = `<img src="${currentCoverUrl}" style="width:100%;height:100%;object-fit:cover;">`;
    extractVisualizerColors(currentCoverUrl);
  } else {
    currentCoverUrl = null;
    coverImg.classList.add('hidden');
    coverPlaceholder.classList.remove('hidden');
    ambientImg.classList.add('hidden');
    miniThumb.textContent = '♪';
    extractVisualizerColors(null);
  }
}

function resetPlayerUI() {
  activeContextLabel = '';
  applyContextBadgeUI();
  currentTitleEl.textContent = 'Выберите трек';
  applyArtistToUI('');
  miniTitle.textContent = 'Выберите трек';
  miniPlayer.classList.add('hidden');
  applyCoverToUI(null);
  renderLyrics('');
  updateCurrentActionsUI();
  setPlayingState(false);
  seekBar.value = 0;
  updateSeekVisual();
  currentTimeEl.textContent = '00:00';
  durationEl.textContent = '00:00';
}

function playTrackById(id) {
  const track = getTrackById(id);
  if (!track) return;
  clearInterval(fadeTimer);
  fadeTimer = null;
  initVisualizer();

  currentTrackId = id;
  if (!queueIds.includes(id)) {
    queueIds = tracks.map((t) => t.id);
    activeContextLabel = '';
  }

  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = URL.createObjectURL(track.audioBlob);

  if (!isIOS) {
    audio.volume = parseFloat(volumeBar.value) || lastVolume || 1;
  }
  audio.src = currentAudioUrl;
  audio.play().then(() => {
    incrementPlayCount(id);
  }).catch(() => {});

  triggerTrackSwapAnimation();
  applyContextBadgeUI();
  currentTitleEl.textContent = track.name;
  applyArtistToUI(track.artist);
  fsLyricsTitle.textContent = track.name;
  fsLyricsArtist.textContent = track.artist || '';
  miniTitle.textContent = track.name;
  miniPlayer.classList.remove('hidden');
  setPlayingState(true);
  applyCoverToUI(track.coverBlob);
  renderLyrics(track.lyrics || '');
  updateCurrentActionsUI();

  renderTracks();
  renderQueue();
  updateMediaSession(track.name, track.artist, currentCoverUrl);
}

function skipBy(seconds) {
  if (!audio.src || !isFinite(audio.duration)) return;
  audio.currentTime = Math.min(Math.max(0, audio.currentTime + seconds), audio.duration);
  seekBar.value = audio.currentTime;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  updateSeekVisual();
}

function setVolume(val) {
  const clamped = Math.min(1, Math.max(0, val));
  audio.volume = clamped;
  volumeBar.value = clamped;
  const pct = Math.round(clamped * 100);
  volumeBar.style.setProperty('--vol', `${pct}%`);
  volumePct.textContent = `${pct}%`;

  const isMuted = clamped === 0;
  iconVol.classList.toggle('hidden', isMuted);
  iconMute.classList.toggle('hidden', !isMuted);

  if (clamped > 0) lastVolume = clamped;
  localStorage.setItem('player_volume', String(clamped));
}

function updateMediaSession(title, artist, coverUrl) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: (artist && artist.trim()) || 'Sopy',
      artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/png' }] : []
    });
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); setPlayingState(true); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); setPlayingState(false); });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('seekbackward', () => skipBy(-10));
    navigator.mediaSession.setActionHandler('seekforward', () => skipBy(10));
  }
}

function playNext() {
  const activeQueue = queueIds.filter((id) => getTrackById(id));
  if (!activeQueue.length) return;

  const qIdx = activeQueue.indexOf(currentTrackId);
  if (isShuffle && activeQueue.length > 1) {
    let nextId;
    do {
      nextId = activeQueue[Math.floor(Math.random() * activeQueue.length)];
    } while (nextId === currentTrackId);
    playTrackById(nextId);
    return;
  }
  const nextIdx = qIdx === -1 ? 0 : (qIdx + 1) % activeQueue.length;
  playTrackById(activeQueue[nextIdx]);
}

function playPrev() {
  const activeQueue = queueIds.filter((id) => getTrackById(id));
  if (!activeQueue.length) return;

  const qIdx = activeQueue.indexOf(currentTrackId);
  const prevIdx = qIdx <= 0 ? activeQueue.length - 1 : qIdx - 1;
  playTrackById(activeQueue[prevIdx]);
}

function formatTime(sec) {
  if (!isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Модальное окно добавления/редактирования трека
function openModal(trackToEdit = null) {
  selectedAudioFile = null;
  selectedImageFile = null;
  audioInput.value = '';
  imageInput.value = '';

  if (trackToEdit) {
    editingTrackId = trackToEdit.id;
    modalTitle.textContent = 'Редактировать трек';
    saveTrackBtn.textContent = 'Сохранить';
    audioPickerWrap.classList.add('hidden');
    titleInput.value = trackToEdit.name;
    artistInput.value = trackToEdit.artist || '';
    lyricsInput.value = trackToEdit.lyrics || '';
    imageLabel.textContent = 'Выбрать новую обложку';

    if (trackToEdit.coverBlob) {
      imagePreview.src = URL.createObjectURL(trackToEdit.coverBlob);
      imagePreview.classList.remove('hidden');
    } else {
      imagePreview.classList.add('hidden');
    }
  } else {
    editingTrackId = null;
    modalTitle.textContent = 'Новый трек';
    saveTrackBtn.textContent = 'Добавить';
    audioPickerWrap.classList.remove('hidden');
    titleInput.value = '';
    artistInput.value = '';
    lyricsInput.value = '';
    audioLabel.textContent = 'Выбрать аудиофайл';
    imageLabel.textContent = 'Выбрать обложку из галереи';
    imagePreview.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
  editingTrackId = null;
}

openModalBtn.addEventListener('click', () => openModal(null));
mobileAddBtn.addEventListener('click', () => openModal(null));
cancelModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

audioInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedAudioFile = file;
  audioLabel.textContent = file.name;

  const meta = await parseAudioMetadata(file);
  if (!titleInput.value.trim()) {
    titleInput.value = meta.title || file.name.replace(/\.[^/.]+$/, '');
  }
  if (!artistInput.value.trim() && meta.artist) {
    artistInput.value = meta.artist;
  }
  if (!selectedImageFile && meta.coverFile) {
    selectedImageFile = meta.coverFile;
    imageLabel.textContent = 'Обложка из файла';
    imagePreview.src = URL.createObjectURL(meta.coverFile);
    imagePreview.classList.remove('hidden');
  }
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedImageFile = file;
  imageLabel.textContent = file.name;
  imagePreview.src = URL.createObjectURL(file);
  imagePreview.classList.remove('hidden');
});

saveTrackBtn.addEventListener('click', () => {
  const tx = db.transaction([STORE_NAME, PLAYLIST_STORE], 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const plStore = tx.objectStore(PLAYLIST_STORE);

  if (editingTrackId !== null) {
    const getReq = store.get(editingTrackId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return;

      record.name = titleInput.value.trim() || record.name;
      record.artist = artistInput.value.trim();
      record.lyrics = lyricsInput.value;
      if (selectedImageFile) record.coverBlob = selectedImageFile;

      store.put(record);

      if (currentTrackId === editingTrackId) {
        currentTitleEl.textContent = record.name;
        applyArtistToUI(record.artist);
        fsLyricsTitle.textContent = record.name;
        fsLyricsArtist.textContent = record.artist || '';
        miniTitle.textContent = record.name;
        renderLyrics(record.lyrics);
        if (selectedImageFile) applyCoverToUI(record.coverBlob);
        updateMediaSession(record.name, record.artist, currentCoverUrl);
      }
    };
  } else {
    if (!selectedAudioFile) {
      alert('Сначала выберите аудиофайл');
      return;
    }

    const name = titleInput.value.trim() || selectedAudioFile.name.replace(/\.[^/.]+$/, '');
    const addReq = store.add({
      name: name,
      artist: artistInput.value.trim(),
      lyrics: lyricsInput.value,
      favorite: activeFilter === 'fav',
      playCount: 0,
      audioBlob: selectedAudioFile,
      coverBlob: selectedImageFile || null
    });

    const activePl = getActivePlaylist();
    if (activePl) {
      addReq.onsuccess = (e) => {
        const newTrackId = e.target.result;
        const plReq = plStore.get(activePl.id);
        plReq.onsuccess = () => {
          const pl = plReq.result;
          if (!pl) return;
          pl.trackIds = Array.isArray(pl.trackIds) ? pl.trackIds : [];
          pl.trackIds.push(newTrackId);
          plStore.put(pl);
        };
      };
    }
  }

  tx.oncomplete = () => {
    closeModal();
    reloadData();
  };
});

// Управление
playBtn.addEventListener('click', () => {
  initVisualizer();
  if (currentTrackId === null && tracks.length) {
    const firstVisible = getFilteredTracks()[0] || tracks[0];
    playTrackById(firstVisible.id);
    return;
  }
  if (!audio.src) return;
  if (audio.paused) {
    clearInterval(fadeTimer);
    fadeTimer = null;
    if (!isIOS) audio.volume = parseFloat(volumeBar.value) || lastVolume || 1;
    audio.play();
    setPlayingState(true);
  } else {
    setPlayingState(false);
    fadeOutAndRun(() => {
      audio.pause();
    });
  }
});

nextBtn.addEventListener('click', () => {
  fadeOutAndRun(playNext, 160);
});
prevBtn.addEventListener('click', () => {
  fadeOutAndRun(playPrev, 160);
});
skipBackBtn.addEventListener('click', () => skipBy(-10));
skipForwardBtn.addEventListener('click', () => skipBy(10));

volumeBar.addEventListener('input', () => {
  clearInterval(fadeTimer);
  fadeTimer = null;
  setVolume(parseFloat(volumeBar.value));
});

muteBtn.addEventListener('click', () => {
  if (audio.volume > 0) {
    setVolume(0);
  } else {
    setVolume(lastVolume || 0.7);
  }
});

// Горячие клавиши
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === 'ArrowRight') {
    skipBy(10);
  } else if (e.code === 'ArrowLeft') {
    skipBy(-10);
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    setVolume(audio.volume + 0.05);
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    setVolume(audio.volume - 0.05);
  }
});

audio.addEventListener('loadedmetadata', () => {
  seekBar.max = audio.duration || 0;
  durationEl.textContent = formatTime(audio.duration);
  updateSeekVisual();
});

audio.addEventListener('timeupdate', () => {
  seekBar.value = audio.currentTime;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  updateSeekVisual();
  syncLyrics(audio.currentTime);
});

audio.addEventListener('ended', () => {
  if (isRepeatOne) {
    audio.currentTime = 0;
    audio.play();
    if (currentTrackId !== null) incrementPlayCount(currentTrackId);
  } else {
    playNext();
  }
});

seekBar.addEventListener('input', () => {
  audio.currentTime = seekBar.value;
  updateSeekVisual();
});

applyTheme(activeTheme);
setVolume(lastVolume);
applyEQ();
updateModeUI();
initDB();
if (!visStarted) {
  visStarted = true;
  drawVisualizer();
}