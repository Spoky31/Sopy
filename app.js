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

let isShuffle = localStorage.getItem('sopy_shuffle') === 'true';
let isRepeatOne = localStorage.getItem('sopy_repeat') === 'true';

let editingTrackId = null;
let selectedAudioFile = null;
let selectedImageFile = null;
let managingPlaylistsForTrackId = null;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS) document.body.classList.add('is-ios');

let visStarted = false;

// Цвета визуализатора
const DEFAULT_VIS_COLORS = {
  top: 'rgba(130, 165, 255, 0.95)',
  bottom: 'rgba(175, 110, 245, 0.88)'
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

// Элементы эквалайзера и таймера сна
const eqBass = document.getElementById('eq-bass');
const eqMid = document.getElementById('eq-mid');
const eqTreble = document.getElementById('eq-treble');
const eqBassVal = document.getElementById('eq-bass-val');
const eqMidVal = document.getElementById('eq-mid-val');
const eqTrebleVal = document.getElementById('eq-treble-val');
const presetBtns = document.querySelectorAll('.preset-btn');
const sleepBtns = document.querySelectorAll('.sleep-btn');
const sleepStatusEl = document.getElementById('sleep-status');

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
    audio.pause();
    setPlayingState(false);
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

// Извлечение контрастных цветов обложки для визуализатора
function extractVisualizerColors(imgUrl) {
  if (!imgUrl) {
    visColors = { ...DEFAULT_VIS_COLORS };
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
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

    const lift = (val, minVal) => Math.max(minVal, Math.min(255, Math.round(val * 1.15 + 50)));
    visColors = {
      top: `rgba(${lift(r1 / c1, 130)}, ${lift(g1 / c1, 130)}, ${lift(b1 / c1, 130)}, 0.95)`,
      bottom: `rgba(${lift(r2 / c2, 95)}, ${lift(g2 / c2, 95)}, ${lift(b2 / c2, 95)}, 0.85)`
    };
  };
  img.src = imgUrl;
}

// Визуализатор + цепочка эквалайзера (с обходом Web Audio на iOS для фонового звука)
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
    let val = 18;
    if (!audio.paused) {
      if (analyser) {
        val = dataArray[i];
      } else if (isIOS) {
        val = 50 + Math.abs(Math.sin(t + i * 0.45) * Math.cos(t * 0.6 + i * 0.2)) * 170;
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
    ctx.roundRect(x, y, barWidth, height, 4);
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

    // Если активный плейлист был удалён — вернуться во «Все»
    if (activeFilter.startsWith('pl:') && !getActivePlaylist()) {
      activeFilter = 'all';
    }

    // Синхронизировать очередь с существующими треками
    const validIds = new Set(tracks.map((t) => t.id));
    queueIds = queueIds.filter((id) => validIds.has(id));
    if (!queueIds.length && tracks.length) {
      queueIds = tracks.map((t) => t.id);
    }

    renderPlaylistBar();
    renderTracks();
    renderQueue();
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

// Модалка добавления конкретного трека в плейлисты
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

function createTrackInfoEl(track) {
  const info = document.createElement('div');
  info.className = 'track-info';

  const name = document.createElement('div');
  name.className = 'track-item-name';
  name.textContent = track.name;
  info.appendChild(name);

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
    else if (activePl) emptyMsg = 'Плейлист пуст. Нажмите ☰ на любом треке, чтобы добавить его сюда.';
    else if (activeFilter === 'fav') emptyMsg = 'В избранном пока пусто';
    trackListEl.innerHTML = `<div class="empty-list">${emptyMsg}</div>`;
    return;
  }

  trackListEl.innerHTML = '';
  visibleTracks.forEach((track) => {
    const item = document.createElement('div');
    item.className = 'track-item' + (track.id === currentTrackId ? ' active' : '');
    item.onclick = () => {
      // Обновляем очередь под текущий открытый список/плейлист
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
    const info = createTrackInfoEl(track);

    const actions = document.createElement('div');
    actions.className = 'track-actions';

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

    actions.append(plBtn, fav, edit, del);
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
    const item = document.createElement('div');
    item.className = 'track-item' + (track.id === currentTrackId ? ' active' : '');
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
    const info = createTrackInfoEl(track);

    item.append(handle, thumb, info);
    queueListEl.appendChild(item);
  });
}

// Текст песни
function renderLyrics(lyricsText) {
  parsedLyrics = [];
  if (!lyricsText || !lyricsText.trim()) {
    lyricsContentEl.innerHTML = '<div class="empty-list">Текст не добавлен. Нажмите ✎ на треке, чтобы вставить текст.</div>';
    return;
  }

  const lines = lyricsText.split('\n');
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.\d+)?\]\s*(.*)/;

  lyricsContentEl.innerHTML = '';
  lines.forEach((rawLine) => {
    const match = rawLine.match(timeRegex);
    const lineObj = match
      ? { time: parseInt(match[1]) * 60 + parseInt(match[2]), text: match[3] }
      : { time: null, text: rawLine };

    if (!lineObj.text.trim()) return;

    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.textContent = lineObj.text;

    if (lineObj.time !== null) {
      div.onclick = () => {
        if (audio.src) {
          audio.currentTime = lineObj.time;
          audio.play();
          setPlayingState(true);
        }
      };
    }

    lineObj.el = div;
    parsedLyrics.push(lineObj);
    lyricsContentEl.appendChild(div);
  });
}

function syncLyrics(currentTime) {
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
    }
    line.el.classList.toggle('active', isActive);
  });
}

function deleteTrack(id) {
  if (id === currentTrackId) {
    audio.pause();
    audio.src = '';
    currentTrackId = null;
    resetPlayerUI();
  }

  const tx = db.transaction([STORE_NAME, PLAYLIST_STORE], 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);

  // Удаляем ID трека из всех плейлистов
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
  initVisualizer();

  currentTrackId = id;
  if (!queueIds.includes(id)) {
    queueIds = tracks.map((t) => t.id);
    activeContextLabel = '';
  }

  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = URL.createObjectURL(track.audioBlob);

  audio.src = currentAudioUrl;
  audio.play();

  applyContextBadgeUI();
  currentTitleEl.textContent = track.name;
  applyArtistToUI(track.artist);
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

audioInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedAudioFile = file;
  audioLabel.textContent = file.name;
  if (!titleInput.value.trim()) {
    titleInput.value = file.name.replace(/\.[^/.]+$/, '');
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
      audioBlob: selectedAudioFile,
      coverBlob: selectedImageFile || null
    });

    // Если открыт конкретный плейлист — сразу добавляем новый трек в него
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
    audio.play();
    setPlayingState(true);
  } else {
    audio.pause();
    setPlayingState(false);
  }
});

nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);
skipBackBtn.addEventListener('click', () => skipBy(-10));
skipForwardBtn.addEventListener('click', () => skipBy(10));

volumeBar.addEventListener('input', () => {
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
  } else {
    playNext();
  }
});

seekBar.addEventListener('input', () => {
  audio.currentTime = seekBar.value;
  updateSeekVisual();
});

setVolume(lastVolume);
applyEQ();
updateModeUI();
initDB();
if (!visStarted) {
  visStarted = true;
  drawVisualizer();
}