import { useState } from 'react';
import { Series, Episode } from '@/types';
import { formatTime } from '@/lib/utils';

interface SeriesSidebarProps {
  series: Series;
  currentEpisodeIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onEpisodeSelect: (episode: Episode) => void;
  onDeleteSeries: (seriesId: string) => Promise<void>;
}

export default function SeriesSidebar({
  series,
  currentEpisodeIndex,
  isOpen,
  onClose,
  onEpisodeSelect,
  onDeleteSeries,
}: SeriesSidebarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-gray-900/95 backdrop-blur-md border-l border-gray-700/50 z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white truncate">{series.name}</h2>
              <p className="text-sm text-sw-gray">
                {series.episodes.length} episode{series.episodes.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2">
              {/* Delete Button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors group"
                title="Delete series"
              >
                <svg className="w-5 h-5 text-sw-gray group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-sw-gray hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400 mb-3">
                Delete "{series.name}"? This will remove the series and all episode tracking. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      await onDeleteSeries(series.id);
                      onClose();
                    } finally {
                      setIsDeleting(false);
                      setShowDeleteConfirm(false);
                    }
                  }}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-3 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Episodes List */}
        <div className="overflow-y-auto h-[calc(100%-80px)] p-2">
          {series.episodes.map((episode, index) => {
            const isPlaying = index === currentEpisodeIndex;
            const isHovered = index === hoveredIndex;
            const progress = episode.progress && episode.duration
              ? Math.round((episode.progress / episode.duration) * 100)
              : 0;

            return (
              <button
                key={`${episode.url}-${index}`}
                onClick={() => onEpisodeSelect(episode)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`w-full p-3 rounded-lg mb-1 text-left transition-all duration-200 ${
                  isPlaying
                    ? 'bg-sw-red/20 border border-sw-red/50'
                    : isHovered
                    ? 'bg-gray-800/80'
                    : 'bg-transparent hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Episode Number / Playing Indicator */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isPlaying ? 'bg-sw-red' : 'bg-gray-700'
                  }`}>
                    {isPlaying ? (
                      <svg className="w-4 h-4 text-white animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    ) : (
                      <span className="text-sm font-medium text-white">{index + 1}</span>
                    )}
                  </div>

                  {/* Episode Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isPlaying ? 'text-white' : 'text-sw-light-gray'
                    }`}>
                      {episode.title}
                    </p>

                    {/* Meta Info */}
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {episode.duration ? (
                        <span className="text-sw-gray">{formatTime(episode.duration)}</span>
                      ) : null}

                      {episode.completed ? (
                        <span className="text-green-500 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Watched
                        </span>
                      ) : progress > 0 ? (
                        <span className="text-sw-red">{progress}%</span>
                      ) : null}
                    </div>

                    {/* Progress Bar */}
                    {!episode.completed && progress > 0 && (
                      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sw-red rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Play on hover */}
                  {isHovered && !isPlaying && (
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          {series.episodes.length === 0 && (
            <div className="text-center py-8 text-sw-gray">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <p className="text-sm">No episodes in this series</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
