# StreamWatch Web

A web version of the StreamWatch extension's library and player, so watching can continue on a phone
(or any browser without the extension). It is a **separate sub-project**: nothing outside `web/` is
edited, and the extension build does not include it.

It has two parts:

| Part | Folder | What it is |
|---|---|---|
| Web app | `web/src` | React pages (home, history, player, settings). Desktop mirrors the extension UI; phones get the same design adapted for touch. |
| Streaming server | `web/server` | A small Node service. iPhones cannot play `.mkv`, so it repackages the file into HLS on the fly with ffmpeg (no re-encoding). It can also serve the built web app. |

Both use the **same Firebase project and the same Firestore data** as the extension, so progress syncs
both ways.

## Ground rules (for anyone working here)

- Never edit anything outside `web/`. The extension source in `../src` is shared **read-only**.
- No new npm dependencies. Packages resolve from the repo root `node_modules` (react, firebase, vite,
  tailwind, lucide-react are already there). The server uses only Node built-ins plus the ffmpeg binary.
- Do not commit, push, or touch git config.
- Private data: real video links are private (they embed the viewer's IP address). Never put them in
  source files, logs you leave behind, or anything that gets committed. Tests that need real files take
  them from a file outside the repo (`--episodes=`).

## Sharing code with the extension

The identity of a video (`mediaKeyFromUrl` in `../src/lib/titleParser.ts`) decides which Firestore
document holds its progress. If the web app had its own copy of that logic, the two could drift and stop
finding each other's progress. So the web app imports the extension's logic directly instead of copying it.

Import aliases (see `vite.config.ts` / `tsconfig.json`):

| Alias | Points to | Use |
|---|---|---|
| `@/…` | `../src/…` (extension) | Shared logic: `lib/firestore`, `lib/library`, `lib/titleParser`, `lib/tmdb`, `lib/subtitles`, `lib/subtitleSearch`, `lib/utils`, `lib/logger`, `lib/firebase`, `types`, and the data hooks `hooks/useRecentHistory`, `hooks/useSeries`, `hooks/useVideoProgress`, `hooks/usePoster`, `hooks/useSettings`. |
| `~/…` | `web/src/…` | Everything written for the web app. |

Extension modules that depend on browser-extension APIs are swapped at build time (same technique as
`../dev-harness/server.mjs`):

| Extension module | Replaced by | Why |
|---|---|---|
| `@/hooks/useAuth` (also imported as `./useAuth`) | `~/platform/useAuth` | Extension signs in with `chrome.identity`; the web uses a Firebase popup or redirect (see [Sign-in](#sign-in)). Same Google account gives the same uid. |
| `@/lib/auth` | `~/platform/auth` | Same reason. |
| `@/lib/firebase` (also `./firebase` from `../src/lib`) | `~/platform/firebase` | Same project config, but `authDomain` can be the page's own host. |

Remaining `chrome.*` calls inside shared modules (`chrome.storage` in `useSettings`, `chrome.runtime.getURL`
in `utils`) are served by a small shim, `~/platform/chrome-shim`, loaded before anything else. It backs
`chrome.storage.*` with `localStorage` and maps extension page URLs to web routes.

**UI components are not shared.** Pages and components are re-implemented under `web/src`, using the
extension's components as the reference, because they need responsive layouts the extension does not.
Small presentational extension components may be imported from `@/…` when they need no change at all.

## Routes

| Route | Page |
|---|---|
| `/` | Home (hero, continue watching, series, movies) |
| `/history` | Watch history |
| `/watch?url=<encoded video link>` | Player |
| `/settings` | Settings |

A tiny History-API router in `~/router` (no library). Use `navigate(path)` and `<Link>` from it, never
`window.location` or `chrome.runtime.getURL` in web code.

## Platform layer (`web/src/platform`)

| Module | Exports |
|---|---|
| `chrome-shim.ts` | side-effect import; defines `window.chrome` subset |
| `auth.ts` | `signInWithGoogle()`, `signOut()`, `onAuthStateChange(cb)`, `getIdToken()`, `AuthUser` (same shape as the extension's) |
| `useAuth.ts` | `useAuth(): { user, isLoading, error, signIn, logOut }` (same shape as the extension's hook) |
| `firebase.ts` | `initializeFirebase()`, `getFirebaseApp()`, `getFirebaseAuth()`, `getFirebaseDb()` (same as the extension's) |
| `authMode.ts` | `AUTH_MODE` (`'redirect'` or `'popup'`), `isSameOriginSignIn()` |
| `stream.ts` | `openMedia(videoUrl)`, `withStart(playlistUrl, seconds)`, `StreamError`, `STREAM_BASE` |
| `env.ts` | `isTouch`, `isIOS`, `canPlayHlsNatively()`, `needsStreamServer(videoUrl)` |
| `fetch-proxy.ts` | side-effect import; routes `https://api.subsource.net/…` requests through the streaming server (that API does not allow cross-site calls) |

`STREAM_BASE` is `VITE_STREAM_URL` if set, otherwise same origin. Read env as
`(import.meta as any).env.X` because `../src/lib/firebase.ts` declares a closed `ImportMeta.env` type.

### Choosing how to play a video (player)

1. `needsStreamServer(url)` is true on Safari-family browsers (native HLS, no MKV) for anything that is
   not `.mp4`/`.m4v`/`.mov`. Then call `openMedia(url)` and set `video.src` to the returned playlist. It is
   a normal full-length VOD stream: `currentTime`, `duration` and seeking behave exactly like a file. When
   resuming, use `withStart(playlist, seconds)` so the phone loads from that point instead of the beginning.
2. Otherwise set `video.src = url` directly, as the extension does.
3. If direct playback fails with "format not supported" before anything played, fall back to step 1 once.
   If the browser has no native HLS, lazy-load hls.js from cdnjs (`hls.js/1.5.17/hls.min.js`) for that case.
4. On phones, `play()` with sound can be refused until a tap: show a "Tap to play" overlay instead of
   failing.

## Sign-in

Google sign-in has two modes, chosen once per page load (`~/platform/authMode`):

| Mode | When | authDomain | Method |
|---|---|---|---|
| Same-origin (redirect) | page served over **https** from a host other than localhost/127.0.0.1 | the page's own host | `signInWithRedirect`, finished by `getRedirectResult` at startup |
| Popup | everything else (localhost, plain http on a LAN address) | `streamwatch-2dfd2.firebaseapp.com` | `signInWithPopup`, as before |

`?authmode=redirect` or `?authmode=popup` in the address forces a mode for that page load (testing).
Redirect mode needs `/__/auth/*` on the same origin, which the streaming server (and `npm run dev`)
forwards to `https://streamwatch-2dfd2.firebaseapp.com/__/auth/*` (Firebase's "proxy auth requests"
option; iOS browsers block the cross-site helper otherwise). Demo mode never touches Firebase auth.

An https deployment at `https://<host>` needs two console settings once:

1. Firebase console > Authentication > Settings > **Authorized domains**: add `<host>`.
2. Google Cloud console > APIs & Services > Credentials > the project's OAuth web client >
   **Authorized redirect URIs**: add `https://<host>/__/auth/handler`.

## Streaming server API (`web/server`)

Default port **8765**. All `/api/*` calls need `Authorization: Bearer <Firebase ID token>`; only uids in
the server's allow-list are accepted. HLS URLs carry a signed, expiring grant instead (media elements
cannot send headers).

```
GET  /api/health                      -> {"ok":true}
POST /api/media/open  {"url": "..."}  -> {"id","playlist":"/hls/<id>/<grant>/index.m3u8","duration",
                                          "video":{"codec","width","height"},
                                          "audio":{"codec","channels","converted":false}}
     errors: {"error":"<text>","code":"unauthorized|forbidden|bad_url|source_gone|unsupported|internal"}
GET  /hls/<id>/<grant>/index.m3u8[?start=<seconds>]   full-length VOD playlist
GET  /hls/<id>/<grant>/init.mp4
GET  /hls/<id>/<grant>/seg_<n>.m4s                    produced on demand, cached on disk
ANY  /api/proxy/subsource/<path>?<query>              forwards to https://api.subsource.net/<path>?<query>
ANY  /__/auth/<path>?<query>                         Firebase sign-in helper, forwarded as-is to
                                                      https://streamwatch-2dfd2.firebaseapp.com/__/auth/… (no token)
GET  anything else                                    the built web app (web/dist), SPA fallback
```

How the stream is produced (the approach was first proven on an iPhone with a throwaway prototype):

- The start and end of the remote file are fetched once and kept in memory; they hold the stream info and
  the MKV seek index (Cues). ffmpeg reads the source through a local caching proxy so its repeated header
  and index reads cost nothing.
- The keyframe list from the Cues defines the segments (each starts on a keyframe, about 6 s long), so the
  whole playlist is known up front.
- A segment request starts ffmpeg at that keyframe (`-ss`, stream copy, fragmented MP4 to stdout). The
  server splits the output at fragment boundaries, rewrites fragment timestamps to absolute episode time,
  writes finished segments to the cache and keeps running a little ahead of the player. A jump elsewhere
  restarts ffmpeg there.
- Audio is copied when it is AAC/AC3/E-AC3/MP3, otherwise converted to AAC. HEVC video is tagged `hvc1`.

Notes on the server as built:

- Each segment is rebuilt from samples so that timestamps are exact episode time; every run starts one
  keyframe early because ffmpeg mis-times the first group of frames after a seek in Matroska.
- `audio` in the open response is `null` for files without an audio track. `/api/health` needs no token.
  Video codecs other than H.264/HEVC answer `unsupported`.
- The video host temporarily blocks a client that sends many requests in a short time (seen during
  testing; it recovered within the hour). Normal use costs about 5 requests to open a file and 4 per jump;
  the server logs a running count. Do not run `test/check.mjs` on all files repeatedly.
- Local testing without sign-in: `STREAMWATCH_DEV_NO_AUTH=1 node web/server/server.mjs` trusts callers on
  this machine only. Combined with `npm --prefix web run demo` and `&stream=1` on a `/watch` address, a
  desktop browser plays a real link through the server.
- Access is limited to the uids in `server/config.local.json` (not committed).
- Read-ahead: after a request the runner produces the first ~30 s of video as fast as possible, then
  paces itself to `readAheadSpeed` times real time (default 3; 0 = no pacing) and stops reading
  `readAheadSeconds` of video beyond the last requested segment (default 60). A request that is waiting
  for a segment always gets full speed. Pacing is backpressure (ffmpeg's stdout is not read), which
  propagates through the source proxy to the video host, so the home network and the host see a
  steady, modest rate instead of full-speed downloads.
- A runner with no requests for about 25 s is stopped. Stopping (idle, seek elsewhere, too many active
  videos, errors, shutdown) always uses SIGKILL and closes ffmpeg's pipes and its reads through the
  source proxy (`/src/<id>?r=<runner>`), so no ffmpeg and no connection to the host is left behind; a
  child still alive 3 s later is logged. Each runner's start line in the log carries the ffmpeg pid.
  On Linux, `pgrep -a ffmpeg` (or `ps -o pid,stat,etime,cmd -C ffmpeg`) should list nothing a minute
  after playback stops.
- Disk cache: besides the size cap (`cacheMaxBytes`, least recently used first), videos not used
  (served or written) for more than `cacheMaxAgeDays` (default 7; 0 disables) are deleted at startup and
  every 3 hours, never one with an active runner or requested in the last 10 minutes. "Last used" is the
  video's cache directory mtime, refreshed at most every 5 minutes while it is served from the cache.
- Tests with local files only (no video host): `node web/server/test/check.mjs --local-dir=<dir>` and
  `node web/server/test/pacing.mjs --local-dir=<dir>` serve the `.mkv` files of `<dir>` from a local
  Range server (a few minutes of H.264/HEVC + AAC each; ffmpeg's `testsrc2` + `sine` are enough).
  `pacing.mjs` checks the read-ahead pace and limit, that no ffmpeg or source connection is left after
  an idle stop, a seek restart and a shutdown, seek latency, and the cache age cleanup.

## Design rules

- The design language is the extension's: colours, fonts, radii and component classes come from
  `../src/styles/globals.css` and `../tailwind.config.js` (both imported, not copied). Use the existing
  classes (`btn-primary`, `btn-secondary`, `btn-ghost`, `btn-icon`, `card`, `media-card`, `nav-tab`,
  `badge-*`, `input`, `hero`, `history-row`, `glass`…). **Do not invent new button or card styles.**
- Desktop (≥ 1024 px, mouse): look and behave like the extension pages.
- Phone/tablet: the same elements, restyled for touch. Additions are allowed only where touch needs them.
  - Touch targets at least 44 px. Nothing may depend on hover: actions that appear on hover on desktop
    must be visible (or behind an explicit "more" button) on touch.
  - Hover lift/zoom effects off under `@media (hover: none)`.
  - Page gutters 16 px; respect `env(safe-area-inset-*)`; no horizontal page scroll at 360 px wide.
  - Card grids: two columns on phones.
  - Modals become full-height bottom sheets; side panels (episode list) become bottom sheets.
  - Keyboard-shortcut hints are hidden on touch devices.
  - Player: tap toggles controls; double-tap left/right seeks ∓10 s; large centre play/pause; a thick,
    draggable seek bar; landscape fills the screen with the custom controls. The fullscreen button uses
    `video.webkitEnterFullscreen()` on iPhone (only native controls are possible there).

## Commands

Run from the repo root:

```
npm --prefix web run dev       # web app dev server (proxies /api and /hls to the streaming server)
npm --prefix web run demo      # web app with a fake signed-in user and sample data (no Firebase)
npm --prefix web run build     # production build into web/dist
npm --prefix web run typecheck
npm --prefix web run server    # streaming server, also serves web/dist, port 8765
```
