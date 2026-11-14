import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useRoute } from '~/router';

const HomePage = lazy(() => import('~/home/HomePage'));
const PlayerPage = lazy(() => import('~/player/PlayerPage'));
const SettingsPage = lazy(() => import('~/settings/SettingsPage'));

function Loading() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-sw-border border-t-sw-accent animate-spin" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-gutter text-center">
      <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="btn-primary">Go home</Link>
    </div>
  );
}

export default function App() {
  const { path } = useRoute();

  let page: ReactNode;
  switch (path) {
    case '/':
      page = <HomePage view="home" />;
      break;
    case '/history':
      page = <HomePage view="history" />;
      break;
    case '/watch':
      page = <PlayerPage />;
      break;
    case '/settings':
      page = <SettingsPage />;
      break;
    default:
      page = <NotFound />;
  }

  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}
