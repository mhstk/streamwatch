import { formatTime } from '@/lib/utils';

interface VideoInfoProps {
  title: string;
  sourceHost: string;
  duration: number;
  progress: number;
  onAddToSeries?: () => void;
  onDownload?: () => void;
}

export default function VideoInfo({
  title,
  sourceHost,
  duration,
  progress,
  onAddToSeries,
  onDownload,
}: VideoInfoProps) {
  const progressPercent = duration > 0 ? Math.round((progress / duration) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Title and Source */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
        <p className="text-sw-gray text-sm">
          Source: <span className="text-sw-light-gray">{sourceHost}</span>
        </p>
      </div>

      {/* Progress Bar */}
      {duration > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-sw-gray mb-1">
            <span>{formatTime(progress)}</span>
            <span>{progressPercent}% watched</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-sw-red transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onAddToSeries}
          className="py-2 px-4 bg-sw-red text-white rounded font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add to Series
        </button>

        <button
          onClick={onDownload}
          className="py-2 px-4 bg-gray-800 text-white rounded font-medium hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>
    </div>
  );
}
