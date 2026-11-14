// Demo stand-in for src/lib/firestore.ts, backed by localStorage.
// Seeded with data shaped like a real account: expiring per-session links,
// the same episode stored under several links, two saved series with the
// same name, raw release names as stored titles.
import { mediaKeyFromUrl } from '../src/lib/titleParser';

export interface VideoPosterInfo {
  posterUrl?: string; backdropUrl?: string; mediaTitle?: string; mediaYear?: number;
  mediaType?: 'movie' | 'tv'; mediaRating?: number; mediaOverview?: string;
}
export interface SubtitlePreference { subtitleId: number; language: string; languageName: string; release: string; savedAt: any }

const KEY = 'harness:db:v3';
const DAY = 86400000;
const ts = (ms: number) => (ms ? { seconds: ms / 1000, toMillis: () => ms, toDate: () => new Date(ms) } : null);

let counter = 0;
function link(file: string, expired = true): string {
  counter++;
  // old links are "expired" (403); the newest link of each video still plays
  return `${location.origin}/media/${expired ? 'expired' : 'ok'}/${1000 + counter}/198.51.100.${counter}/17770${counter}/${file}`;
}

interface Row { id: string; url: string; title: string; duration: number; progress: number; progressPercent: number; completed: boolean; lastWatched: number; [k: string]: any }

function seed() {
  const now = Date.now();
  const rows: Row[] = [];
  const add = (file: string, percent: number, daysAgo: number, duration = 1320, expired = true) => {
    const url = link(file, expired);
    rows.push({
      id: 'h' + counter,
      url,
      title: file.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' '),
      sourceHost: 'eu-download-storage-12.example.info',
      duration,
      progress: Math.round(duration * percent) / 100,
      progressPercent: percent,
      completed: percent >= 90,
      lastWatched: now - daysAgo * DAY,
    });
  };
  const sunny = (se: string, tail = '480p_WEB-DL_RMTeam_30NAMA') => `Its_Always_Sunny_in_Philadelphia_${se}_${tail}.mkv`;

  add('Monster_The_Jeffrey_Dahmer_Story_S01E02_10bit_x265_720p_WEBRip_2CH_PSA_30NAMA.mkv', 44, 0.1, 52, false);     // playable: length of the sample clip
  add('Monster_The_Jeffrey_Dahmer_Story_S01E01_10bit_x265_720p_WEBRip_2CH_PSA_30NAMA.mkv', 97, 0.2, 3100);
  add('Harry_Potter_and_the_Sorcerer_s_Stone_2001_EXTENDED_10bit_720p_x265_BrRip_6CH_PSA_30NAMA.mkv', 30, 1.2, 52, false);     // playable
  add('Love_Island_S05E25_WEBRip_ION10_30NAMA.mp4', 99, 2, 3449);
  add('Love_Island_S05E20_480p_WEB-DL_RMTeam_30NAMA.mkv', 98, 2.3, 2766);
  add(sunny('S15E07'), 92, 8);
  add(sunny('S15E04'), 1, 8.05);          // re-opened via a new link
  add(sunny('S15E03'), 3, 8.06);
  add(sunny('S15E04'), 97, 11);           // actually watched
  add(sunny('S15E02'), 100, 11.1);
  add(sunny('S14E10', '480p_WEBRip_RMTeam_30NAMA'), 23, 15);
  add(sunny('S13E06', '10bit_x265_720p_WEB-DL_30nama_30NAMA'), 0, 40);
  add(sunny('S11E05', '10bit_x265_720p_WEB-DL_30nama_30NAMA'), 63, 75);
  add('Stranger_Than_Fiction_2006_1080p_BrRip_30nama_30NAMA.mkv', 94, 9, 6775);
  add('Survivor_S28E10_720p_WEB-DL_30nama_30NAMA.mkv', 99, 10, 2582);
  add('Survivor_S28E09_720p_WEB-DL_30nama_30NAMA.mkv', 98, 12, 2582);
  add('Canada_Shore_S01E09_720p_WEB-DL_30nama_30NAMA.mkv', 100, 14, 2606);
  add('Canada_Shore_S01E05_720p_WEB-DL_30nama_30NAMA.mkv', 99, 15, 2679);
  add('Canada_Shore_S01E05_720p_WEB-DL_30nama_30NAMA.mkv', 1, 15.5, 2679);
  add('Bridgerton_S04E04_10bit_x265_720p_WEBRip_2CH_PSA_30NAMA.mkv', 93, 19, 3782);
  add('Friends_S05E16_10bit_x265_1080p_BluRay_Silence_30NAMA.mkv', 0, 20, 1327);
  add('Friends_S05E15_10bit_x265_1080p_BluRay_Silence_30NAMA.mkv', 100, 20.1, 1332);
  add('Friends_S03E18_720p_BluRay_PaHe_30NAMA.mkv', 100, 30, 1367);
  add('No_Other_Choice_2025_10bit_1080p_x265_WEB-DL_AAC_PaHe_30NAMA.mkv', 100, 22, 8300);
  add('Palestine_36_2025_10bit_1080p_x265_WEB-DL_6CH_YIFY_30NAMA.mp4', 87, 26, 7100);
  add('The_Smashing_Machine_2025_10bit_1080p_x265_WEB-DL_6CH_PSA_30NAMA.mkv', 50, 55, 7388);
  add('Saltburn_2023_10bit_720p_x265_WEB-DL_6CH_PSA_30NAMA.mkv', 1, 60, 7905);
  add('Grave_of_the_Fireflies_1988_10bit_1080p_x265_BrRip_HazMatt_30NAMA.mkv', 0, 61, 5300);
  add('Inside_Job_S02E01_10bit_x265_720p_WEBRip_2CH_PSA_30NAMA.mkv', 93, 70, 1752);
  add('A_Knight_of_the_Seven_Kingdoms_S01E01_10bit_x265_1080p_WEBRip_6CH_PSA_30NAMA.mkv', 100, 72, 2512);

  const ep = (file: string, index: number, season: number, episodeNumber: number, extra: any = {}) =>
    ({ url: link(file), title: file.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' '), index, season, episodeNumber, completed: false, ...extra });
  const series = [
    { id: 's1', name: 'Its Always Sunny in Philadelphia', currentEpisodeIndex: 0, updatedAt: now - 80 * DAY, episodes: [
      ep(sunny('S10E04', '10bit_x265_720p_WEB-DL_30nama_30NAMA'), 0, 10, 4, { duration: 1264, progress: 164, lastWatched: now - 300 * DAY }),
    ] },
    { id: 's2', name: 'Its Always Sunny in Philadelphia', currentEpisodeIndex: 0, updatedAt: now - 8 * DAY, episodes: [
      ep(sunny('S15E07'), 0, 15, 7),
      ep(sunny('S15E08'), 1, 15, 8),
      ep(sunny('S15E09'), 2, 15, 9),
    ] },
    { id: 's3', name: 'A Knight of the Seven Kingdoms', currentEpisodeIndex: 0, updatedAt: now - 72 * DAY, episodes: [
      ep('A_Knight_of_the_Seven_Kingdoms_S01E01_10bit_x265_1080p_WEBRip_6CH_PSA_30NAMA.mkv', 0, 1, 1, { completed: true, duration: 2512 }),
      ep('A_Knight_of_the_Seven_Kingdoms_S01E02_10bit_x265_1080p_WEBRip_6CH_PSA_30NAMA.mkv', 1, 1, 2),
    ] },
  ];
  return { history: rows, series, prefs: {} as Record<string, any> };
}

type Db = ReturnType<typeof seed>;
function load(): Db {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const db = seed();
  save(db);
  return db;
}
function save(db: Db) { localStorage.setItem(KEY, JSON.stringify(db)); }
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function toHistory(r: Row): any {
  return { ...r, lastWatched: ts(r.lastWatched), createdAt: ts(r.lastWatched) };
}
function toSeries(s: any): any {
  return {
    ...s,
    createdAt: ts(s.updatedAt), updatedAt: ts(s.updatedAt),
    episodes: s.episodes
      .map((e: any) => ({ ...e, lastWatched: e.lastWatched ? ts(e.lastWatched) : undefined }))
      .sort((a: any, b: any) => a.season - b.season || (a.episodeNumber ?? a.index) - (b.episodeNumber ?? b.index)),
  };
}
const unTs = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);

export async function saveVideoProgress(_u: string, videoUrl: string, progress: number, duration: number, title: string, extra?: { sourcePage?: string }) {
  const db = load();
  const key = mediaKeyFromUrl(videoUrl);
  const id = 'k:' + key;
  let row = db.history.find((r) => r.id === id);
  if (!row) { row = { id } as Row; db.history.push(row); }
  const progressPercent = duration > 0 ? Math.round((progress / duration) * 100) : 0;
  Object.assign(row, { url: videoUrl, mediaKey: key, title, duration, progress, progressPercent, completed: progressPercent >= 90, lastWatched: Date.now(), ...(extra?.sourcePage ? { sourcePage: extra.sourcePage } : {}) });
  save(db);
  console.log('[mock] saveVideoProgress', title, Math.round(progress), progressPercent + '%');
}
export async function updateVideoPoster(_u: string, historyId: string, info: VideoPosterInfo) {
  const db = load();
  const row = db.history.find((r) => r.id === historyId);
  if (row) { Object.assign(row, info); save(db); }
}
export async function getVideoProgress(_u: string, videoUrl: string) {
  await delay(400);
  const db = load();
  const key = mediaKeyFromUrl(videoUrl);
  const matches = db.history.filter((r) => r.id === 'k:' + key || r.url === videoUrl || mediaKeyFromUrl(r.url) === key)
    .sort((a, b) => b.lastWatched - a.lastWatched);
  const direct = matches.find((r) => r.id === 'k:' + key) || matches[0];
  console.log('[mock] getVideoProgress', key, direct ? direct.progressPercent + '%' : 'none');
  return direct ? toHistory(direct) : null;
}
export async function getRecentHistory(_u: string, max = 10) {
  await delay();
  return load().history.slice().sort((a, b) => b.lastWatched - a.lastWatched).slice(0, max).map(toHistory);
}
export async function clearWatchHistory() { const db = load(); db.history = []; save(db); }
export async function deleteHistoryEntries(_u: string, ids: string[]) {
  await delay(150);
  const db = load(); db.history = db.history.filter((r) => !ids.includes(r.id)); save(db);
}
export async function getAllSeries() { await delay(); return load().series.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(toSeries); }
export async function getSeries(_u: string, id: string) { const s = load().series.find((x) => x.id === id); return s ? toSeries(s) : null; }
export async function createSeries(_u: string, name: string) {
  const db = load(); const s = { id: 's' + Date.now(), name, currentEpisodeIndex: 0, updatedAt: Date.now(), episodes: [] as any[] };
  db.series.push(s); save(db); return toSeries(s);
}
export async function addEpisodeToSeries(_u: string, seriesId: string, url: string, title?: string, season?: number, episodeNumber?: number) {
  const db = load(); const s = db.series.find((x) => x.id === seriesId); if (!s) throw new Error('Series not found');
  const i = s.episodes.findIndex((e: any) => (episodeNumber != null ? e.episodeNumber === episodeNumber && (e.season ?? 1) === (season ?? 1) : e.url === url));
  const epi = { url, title: title || url, index: i >= 0 ? s.episodes[i].index : s.episodes.length, season: season ?? 1, episodeNumber, completed: i >= 0 ? s.episodes[i].completed : false };
  if (i >= 0) s.episodes[i] = { ...s.episodes[i], ...epi }; else s.episodes.push(epi);
  s.updatedAt = Date.now(); save(db);
}
export async function updateSeries(_u: string, id: string, updates: any) { const db = load(); const s = db.series.find((x) => x.id === id); if (s) { Object.assign(s, updates); save(db); } }
export async function updateEpisodeInSeries(_u: string, seriesId: string, index: number, updates: any, episodeUrl?: string) {
  const db = load(); const s = db.series.find((x) => x.id === seriesId); if (!s) throw new Error('Series not found');
  const i = episodeUrl ? s.episodes.findIndex((e: any) => e.url === episodeUrl) : index;
  if (i < 0) throw new Error('Episode not found');
  const u = { ...updates }; if ('lastWatched' in u) u.lastWatched = unTs(u.lastWatched);
  s.episodes[i] = { ...s.episodes[i], ...u }; s.updatedAt = Date.now(); save(db);
  console.log('[mock] updateEpisodeInSeries', s.name, i, Object.keys(updates).join(','));
}
export async function removeEpisodeFromSeries() {}
export async function deleteSeries(_u: string, id: string) { await delay(200); const db = load(); db.series = db.series.filter((x) => x.id !== id); save(db); }
export async function deleteAllSeries() { await delay(200); const db = load(); db.series = []; save(db); }
export async function findSeriesByVideoUrl(_u: string, videoUrl: string) {
  await delay(200);
  const all = await getAllSeries();
  const key = mediaKeyFromUrl(videoUrl);
  for (const series of all) {
    const episodeIndex = series.episodes.findIndex((e: any) => e.url === videoUrl || mediaKeyFromUrl(e.url) === key);
    if (episodeIndex !== -1) return { series, episodeIndex };
  }
  return null;
}
export async function saveSubtitlePreference(_u: string, url: string, pref: any) { const db = load(); db.prefs[mediaKeyFromUrl(url)] = pref; save(db); }
export async function getSubtitlePreference(): Promise<SubtitlePreference | null> { return null; }
export async function deleteSubtitlePreference() {}
