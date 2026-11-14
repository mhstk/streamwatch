// /watch?url=<video link>[&stream=1]
// The player is keyed by the link, so another episode fully resets the page.
// ?stream=1 treats needsStreamServer() as true (to exercise the streaming path on desktop).
import './player.css';
import { Link, useRoute } from '~/router';
import Player from './Player';

export default function PlayerPage() {
  const { query } = useRoute();
  const url = query.get('url') || '';
  const forceStream = query.get('stream') === '1';

  if (!url) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-gray-900 to-sw-dark text-white flex items-center justify-center px-gutter pt-safe pb-safe">
        <div className="text-center animate-fade-up">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-sw-red/20 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-sw-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
            <h1 className="text-3xl font-bold"><span className="text-sw-accent">Stream</span>Watch</h1>
          </div>
          <p className="text-sw-text-secondary mb-5">No video URL provided</p>
          <Link to="/" className="btn-primary no-underline">Go home</Link>
        </div>
      </div>
    );
  }

  return <Player key={`${forceStream ? 's' : 'd'}|${url}`} videoUrl={url} forceStream={forceStream} />;
}
