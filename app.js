const state = {
  media: [],
  tracks: [
    { id: crypto.randomUUID(), type: 'video', name: 'Video 1', clips: [] },
    { id: crypto.randomUUID(), type: 'audio', name: 'Audio 1', clips: [] },
    { id: crypto.randomUUID(), type: 'text', name: 'Text 1', clips: [] },
  ],
  selectedClipId: null,
  playhead: 0,
  duration: 60,
  zoom: 100,
  playing: false,
  speed: 1,
  audioEls: new Map(),
  activeSource: null,
};

const el = {
  mediaInput: document.getElementById('mediaInput'),
  mediaLibrary: document.getElementById('mediaLibrary'),
  tracksContainer: document.getElementById('tracksContainer'),
  timelineRuler: document.getElementById('timelineRuler'),
  timelineScroller: document.getElementById('timelineScroller'),
  playhead: document.getElementById('playhead'),
  previewVideo: document.getElementById('previewVideo'),
  previewImage: document.getElementById('previewImage'),
  previewText: document.getElementById('previewText'),
  previewViewport: document.getElementById('previewViewport'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  backBtn: document.getElementById('backBtn'),
  forwardBtn: document.getElementById('forwardBtn'),
  timecode: document.getElementById('timecode'),
  zoomLabel: document.getElementById('zoomLabel'),
  exportProgress: document.getElementById('exportProgress'),
};

const sliders = ['brightness', 'contrast', 'saturation', 'grayscale', 'sepia'].map((id) => document.getElementById(id));

el.mediaInput.addEventListener('change', async (e) => {
  for (const file of e.target.files) await importFile(file);
  renderLibrary();
});

document.getElementById('addTextBtn').addEventListener('click', addTextClip);
document.getElementById('splitBtn').addEventListener('click', splitSelectedClip);
document.getElementById('deleteClipBtn').addEventListener('click', deleteSelectedClip);
document.getElementById('zoomIn').addEventListener('click', () => setZoom(state.zoom + 20));
document.getElementById('zoomOut').addEventListener('click', () => setZoom(Math.max(40, state.zoom - 20)));
document.getElementById('addVideoTrack').addEventListener('click', () => addTrack('video'));
document.getElementById('addAudioTrack').addEventListener('click', () => addTrack('audio'));
document.getElementById('addTextTrack').addEventListener('click', () => addTrack('text'));
document.getElementById('speedSelect').addEventListener('change', (e) => (state.speed = Number(e.target.value)));
document.getElementById('exportBtn').addEventListener('click', exportTimeline);

el.playPauseBtn.addEventListener('click', () => (state.playing ? pause() : play()));
el.backBtn.addEventListener('click', () => seek(state.playhead - 5));
el.forwardBtn.addEventListener('click', () => seek(state.playhead + 5));

for (const slider of sliders) slider.addEventListener('input', applyPreviewFilters);

for (const [id, key] of [['volume', 'volume'], ['fadeIn', 'fadeIn'], ['fadeOut', 'fadeOut']]) {
  document.getElementById(id).addEventListener('input', (e) => updateSelectedAudio(key, Number(e.target.value)));
}
document.getElementById('mute').addEventListener('change', (e) => updateSelectedAudio('mute', e.target.checked));

el.timelineScroller.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.clip')) {
    const rect = el.timelineScroller.getBoundingClientRect();
    seek((e.clientX - rect.left + el.timelineScroller.scrollLeft - 160) / state.zoom);
  }
});

function setZoom(value) {
  state.zoom = value;
  el.zoomLabel.textContent = `${value} px/s`;
  renderTimeline();
}

async function importFile(file) {
  const url = URL.createObjectURL(file);
  const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
  const duration = await getDuration(file, type, url);
  const media = { id: crypto.randomUUID(), file, url, type, name: file.name, duration };
  media.thumb = await makeThumb(media);
  state.media.push(media);
  state.duration = Math.max(state.duration, duration + 5);
}

function getDuration(file, type, url) {
  if (type === 'image') return Promise.resolve(5);
  return new Promise((resolve) => {
    const m = document.createElement(type === 'audio' ? 'audio' : 'video');
    m.preload = 'metadata';
    m.src = url;
    m.onloadedmetadata = () => resolve(m.duration || 5);
    m.onerror = () => resolve(5);
  });
}

async function makeThumb(media) {
  if (media.type === 'image') return media.url;
  if (media.type === 'audio') return 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect width="100%" height="100%" fill="#0e9f6e"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="14" fill="white">AUDIO</text></svg>');
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = media.url;
    video.currentTime = 0.1;
    video.muted = true;
    video.onloadeddata = () => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 72;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    video.onerror = () => resolve('');
  });
}

function renderLibrary() {
  el.mediaLibrary.innerHTML = '';
  const tpl = document.getElementById('mediaItemTpl');
  for (const media of state.media) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = media.id;
    node.querySelector('.thumb').src = media.thumb || '';
    node.querySelector('.name').textContent = media.name;
    node.querySelector('.duration').textContent = `${media.type.toUpperCase()} • ${fmt(media.duration)}`;
    node.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', media.id));
    node.querySelector('.remove').addEventListener('click', () => {
      state.media = state.media.filter((m) => m.id !== media.id);
      renderLibrary();
    });
    el.mediaLibrary.appendChild(node);
  }
}

function addTrack(type) {
  const count = state.tracks.filter((t) => t.type === type).length + 1;
  state.tracks.push({ id: crypto.randomUUID(), type, name: `${cap(type)} ${count}`, clips: [] });
  renderTimeline();
}

function renderTimeline() {
  renderRuler();
  el.tracksContainer.innerHTML = '';
  for (const track of state.tracks) {
    const row = document.createElement('div');
    row.className = 'track';
    row.dataset.trackId = track.id;
    const header = document.createElement('div');
    header.className = 'track-header';
    header.innerHTML = `<strong>${track.name}</strong><button data-act="up">↑</button><button data-act="down">↓</button><button data-act="del">✕</button>`;
    header.addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      const idx = state.tracks.findIndex((t) => t.id === track.id);
      if (act === 'up' && idx > 0) [state.tracks[idx - 1], state.tracks[idx]] = [state.tracks[idx], state.tracks[idx - 1]];
      if (act === 'down' && idx < state.tracks.length - 1) [state.tracks[idx + 1], state.tracks[idx]] = [state.tracks[idx], state.tracks[idx + 1]];
      if (act === 'del') state.tracks = state.tracks.filter((t) => t.id !== track.id);
      renderTimeline();
    });
    const body = document.createElement('div');
    body.className = 'track-body';
    body.addEventListener('dragover', (e) => e.preventDefault());
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      const media = state.media.find((m) => m.id === e.dataTransfer.getData('text/plain'));
      if (!media) return;
      const t = state.tracks.find((x) => x.id === track.id);
      const start = pxToSec(e.offsetX);
      t.clips.push(newClipFromMedia(media, t.type, start));
      renderTimeline();
    });

    for (const clip of track.clips) {
      const c = document.createElement('div');
      c.className = `clip ${track.type} ${state.selectedClipId === clip.id ? 'selected' : ''}`;
      c.style.left = `${secToPx(clip.start)}px`;
      c.style.width = `${Math.max(12, secToPx(clip.duration))}px`;
      c.dataset.clipId = clip.id;
      c.textContent = clip.label;
      c.appendChild(Object.assign(document.createElement('div'), { className: 'resize-handle resize-left' }));
      c.appendChild(Object.assign(document.createElement('div'), { className: 'resize-handle resize-right' }));
      wireClipInteractions(c, track, clip);
      body.appendChild(c);
    }
    row.append(header, body);
    el.tracksContainer.appendChild(row);
  }
  updatePlayheadVisual();
}

function wireClipInteractions(node, track, clip) {
  node.addEventListener('pointerdown', (e) => {
    state.selectedClipId = clip.id;
    renderTimeline();
    const onLeft = e.target.classList.contains('resize-left');
    const onRight = e.target.classList.contains('resize-right');
    const startX = e.clientX;
    const origStart = clip.start;
    const origDur = clip.duration;
    const move = (ev) => {
      const dx = (ev.clientX - startX) / state.zoom;
      if (onLeft) {
        clip.start = snap(Math.max(0, origStart + dx));
        clip.duration = snap(Math.max(0.2, origDur - dx));
      } else if (onRight) {
        clip.duration = snap(Math.max(0.2, origDur + dx));
      } else {
        clip.start = snap(Math.max(0, origStart + dx));
      }
      state.duration = Math.max(state.duration, clip.start + clip.duration + 2);
      renderTimeline();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function newClipFromMedia(media, trackType, start) {
  const duration = trackType === 'text' ? 4 : Math.min(media.duration, 10);
  return {
    id: crypto.randomUUID(),
    mediaId: media.id,
    label: media.name,
    start: snap(Math.max(0, start)),
    duration,
    trimStart: 0,
    trimEnd: 0,
    volume: 1,
    mute: false,
    fadeIn: 0,
    fadeOut: 0,
    text: '',
    fontSize: 44,
    color: '#ffffff',
    x: 50,
    y: 80,
  };
}

function addTextClip() {
  const track = state.tracks.find((t) => t.type === 'text') || (addTrack('text'), state.tracks.at(-1));
  const text = prompt('Text content', 'New Title') || 'New Title';
  track.clips.push({
    id: crypto.randomUUID(),
    mediaId: null,
    label: `Text: ${text}`,
    start: snap(state.playhead),
    duration: 4,
    text,
    fontSize: 42,
    color: '#ffffff',
    x: 50,
    y: 82,
  });
  renderTimeline();
}

function splitSelectedClip() {
  for (const track of state.tracks) {
    const idx = track.clips.findIndex((c) => c.id === state.selectedClipId);
    if (idx < 0) continue;
    const clip = track.clips[idx];
    const rel = state.playhead - clip.start;
    if (rel <= 0.2 || rel >= clip.duration - 0.2) return;
    const left = { ...clip, id: crypto.randomUUID(), duration: snap(rel), label: clip.label + ' A' };
    const right = { ...clip, id: crypto.randomUUID(), start: snap(state.playhead), duration: snap(clip.duration - rel), trimStart: (clip.trimStart || 0) + rel, label: clip.label + ' B' };
    track.clips.splice(idx, 1, left, right);
    state.selectedClipId = right.id;
    renderTimeline();
    return;
  }
}

function deleteSelectedClip() {
  for (const track of state.tracks) track.clips = track.clips.filter((c) => c.id !== state.selectedClipId);
  state.selectedClipId = null;
  renderTimeline();
}

function seek(seconds) {
  state.playhead = Math.min(Math.max(0, seconds), state.duration);
  syncMediaToPlayhead();
  updatePlayheadVisual();
}

function play() {
  state.playing = true;
  el.playPauseBtn.textContent = '⏸ Pause';
  tick();
}

function pause() {
  state.playing = false;
  el.playPauseBtn.textContent = '▶ Play';
  el.previewVideo.pause();
  for (const a of state.audioEls.values()) a.pause();
}

let lastTs = 0;
function tick(ts = performance.now()) {
  if (!state.playing) return;
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  seek(state.playhead + dt * state.speed);
  if (state.playhead >= state.duration) {
    pause();
    lastTs = 0;
    return;
  }
  requestAnimationFrame(tick);
}

function syncMediaToPlayhead() {
  const vclip = activeClip('video') || activeClip('image');
  const tclip = activeTextClip();

  if (!vclip) {
    el.previewVideo.style.display = 'none';
    el.previewImage.style.display = 'none';
  } else {
    const media = state.media.find((m) => m.id === vclip.mediaId);
    if (media?.type === 'image') {
      el.previewImage.src = media.url;
      el.previewImage.style.display = 'block';
      el.previewVideo.style.display = 'none';
    } else if (media?.type === 'video') {
      if (state.activeSource !== media.id) {
        state.activeSource = media.id;
        el.previewVideo.src = media.url;
      }
      el.previewVideo.style.display = 'block';
      el.previewImage.style.display = 'none';
      const targetTime = (vclip.trimStart || 0) + state.playhead - vclip.start;
      if (Math.abs(el.previewVideo.currentTime - targetTime) > 0.1) el.previewVideo.currentTime = Math.max(0, targetTime);
      if (state.playing) el.previewVideo.play().catch(() => {});
      else el.previewVideo.pause();
    }
  }

  if (tclip) {
    el.previewText.textContent = tclip.text;
    el.previewText.style.color = tclip.color;
    el.previewText.style.fontSize = `${tclip.fontSize}px`;
    el.previewText.style.left = `${tclip.x - 50}%`;
    el.previewText.style.bottom = `${100 - tclip.y}%`;
  } else {
    el.previewText.textContent = '';
  }

  syncAudio();
  applyPreviewFilters();
  el.timecode.textContent = `${fmt(state.playhead)} / ${fmt(state.duration)}`;
}

function syncAudio() {
  const clips = activeClipsByType('audio');
  const playingIds = new Set();
  for (const clip of clips) {
    const media = state.media.find((m) => m.id === clip.mediaId);
    if (!media) continue;
    let a = state.audioEls.get(clip.id);
    if (!a) {
      a = new Audio(media.url);
      a.preload = 'auto';
      state.audioEls.set(clip.id, a);
    }
    playingIds.add(clip.id);
    const rel = state.playhead - clip.start + (clip.trimStart || 0);
    if (Math.abs(a.currentTime - rel) > 0.2) a.currentTime = Math.max(0, rel);
    const edgeIn = clip.fadeIn > 0 ? Math.min(1, rel / clip.fadeIn) : 1;
    const edgeOut = clip.fadeOut > 0 ? Math.min(1, (clip.start + clip.duration - state.playhead) / clip.fadeOut) : 1;
    a.volume = (clip.mute ? 0 : clip.volume) * Math.min(edgeIn, edgeOut);
    if (state.playing) a.play().catch(() => {}); else a.pause();
  }
  for (const [id, a] of state.audioEls.entries()) {
    if (!playingIds.has(id)) a.pause();
  }
}

function activeClip(type) {
  return state.tracks
    .filter((t) => (type === 'image' ? t.type === 'video' : t.type === type))
    .flatMap((t) => t.clips)
    .find((c) => {
      const media = state.media.find((m) => m.id === c.mediaId);
      return c.start <= state.playhead && c.start + c.duration >= state.playhead && (type === 'image' ? media?.type === 'image' : media?.type === type);
    });
}

function activeTextClip() {
  return state.tracks
    .filter((t) => t.type === 'text')
    .flatMap((t) => t.clips)
    .find((c) => c.start <= state.playhead && c.start + c.duration >= state.playhead);
}

function activeClipsByType(type) {
  return state.tracks
    .filter((t) => t.type === type)
    .flatMap((t) => t.clips)
    .filter((c) => c.start <= state.playhead && c.start + c.duration >= state.playhead);
}

function applyPreviewFilters() {
  const selected = findSelectedClip();
  const values = {
    brightness: Number(document.getElementById('brightness').value),
    contrast: Number(document.getElementById('contrast').value),
    saturation: Number(document.getElementById('saturation').value),
    grayscale: Number(document.getElementById('grayscale').value),
    sepia: Number(document.getElementById('sepia').value),
  };
  if (selected) selected.filters = values;
  const sourceClip = selected || activeClip('video') || activeClip('image');
  const f = sourceClip?.filters || values;
  el.previewViewport.style.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%)`;
}

function updateSelectedAudio(key, value) {
  const clip = findSelectedClip();
  if (!clip) return;
  clip[key] = value;
}

function findSelectedClip() {
  for (const t of state.tracks) {
    const c = t.clips.find((x) => x.id === state.selectedClipId);
    if (c) return c;
  }
  return null;
}

async function exportTimeline() {
  pause();
  const [w, h] = document.getElementById('resolutionSelect').value.split('x').map(Number);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);

  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  recorder.start(100);
  const fps = 24;
  for (let t = 0; t <= state.duration; t += 1 / fps) {
    seek(t);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (el.previewVideo.style.display === 'block' && el.previewVideo.readyState >= 2) {
      ctx.filter = getComputedStyle(el.previewViewport).filter;
      ctx.drawImage(el.previewVideo, 0, 0, w, h);
    }
    if (el.previewImage.style.display === 'block') {
      ctx.filter = getComputedStyle(el.previewViewport).filter;
      ctx.drawImage(el.previewImage, 0, 0, w, h);
    }
    const text = el.previewText.textContent;
    if (text) {
      ctx.filter = 'none';
      ctx.fillStyle = el.previewText.style.color || '#fff';
      ctx.font = `${Math.floor(parseFloat(el.previewText.style.fontSize || '40'))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(text, w / 2, h * 0.87);
    }
    el.exportProgress.value = Math.round((t / state.duration) * 100);
    await new Promise((r) => setTimeout(r, 0));
  }
  recorder.stop();
  const blob = await done;
  el.exportProgress.value = 100;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'litecut-export.mp4';
  a.click();
}

function renderRuler() {
  el.timelineRuler.innerHTML = '';
  const width = secToPx(state.duration) + 200;
  el.timelineRuler.style.width = `${width}px`;
  for (let i = 0; i <= state.duration; i += 1) {
    const m = document.createElement('div');
    m.className = 'ruler-mark';
    m.style.left = `${160 + secToPx(i)}px`;
    m.textContent = i % 5 === 0 ? `${i}s` : '';
    el.timelineRuler.appendChild(m);
  }
}

function updatePlayheadVisual() {
  el.playhead.style.left = `${160 + secToPx(state.playhead)}px`;
  el.playhead.style.height = `${el.timelineRuler.offsetHeight + state.tracks.length * 72}px`;
  el.timecode.textContent = `${fmt(state.playhead)} / ${fmt(state.duration)}`;
}

function secToPx(s) { return s * state.zoom; }
function pxToSec(px) { return px / state.zoom; }
function snap(v) { return Math.round(v * 10) / 10; }
function cap(v) { return v[0].toUpperCase() + v.slice(1); }
function fmt(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${String(m).padStart(2, '0')}:${sec}`;
}

renderLibrary();
renderTimeline();
seek(0);
