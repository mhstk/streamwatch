import { useRef, useEffect } from 'react';
import {
  MediaPlayer,
  MediaProvider,
  type MediaPlayerInstance,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

interface VideoPlayerProps {
  src: string;
  title: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onReady?: (duration: number) => void;
  initialTime?: number;
  autoPlay?: boolean;
}

export default function VideoPlayer({
  src,
  title,
  onTimeUpdate,
  onEnded,
  onReady,
  initialTime = 0,
  autoPlay = true,
}: VideoPlayerProps) {
  const playerRef = useRef<MediaPlayerInstance>(null);

  // Seek to initial time when player is ready
  useEffect(() => {
    if (playerRef.current && initialTime > 0) {
      const player = playerRef.current;

      const handleCanPlay = () => {
        if (player.currentTime === 0 && initialTime > 0) {
          player.currentTime = initialTime;
        }
      };

      player.addEventListener('can-play', handleCanPlay);
      return () => player.removeEventListener('can-play', handleCanPlay);
    }
  }, [initialTime]);

  return (
    <MediaPlayer
      ref={playerRef}
      title={title}
      src={src}
      autoPlay={autoPlay}
      playsInline
      storage="streamwatch-player"
      onTimeUpdate={() => {
        if (playerRef.current && onTimeUpdate) {
          onTimeUpdate(
            playerRef.current.currentTime,
            playerRef.current.duration
          );
        }
      }}
      onEnded={() => {
        onEnded?.();
      }}
      onCanPlay={() => {
        if (playerRef.current && onReady) {
          onReady(playerRef.current.duration);
        }
      }}
      className="w-full aspect-video bg-black"
    >
      <MediaProvider />
      <DefaultVideoLayout
        icons={defaultLayoutIcons}
        slots={{
          // Can customize slots here if needed
        }}
      />
    </MediaPlayer>
  );
}
