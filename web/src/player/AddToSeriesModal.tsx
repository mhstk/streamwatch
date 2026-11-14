// "Add to Series" dialog (the extension's AddToSeriesModal without the source-page scan,
// which needs the extension's background page). Bottom sheet on touch layouts.
import { useEffect, useState } from 'react';
import { X, Plus, Layers } from 'lucide-react';
import type { Series } from '@/types';
import { parseEpisodeInfo, type ParsedEpisode } from '@/lib/episodeParser';
import { isSameMedia } from '@/lib/titleParser';
import Dialog from './Dialog';

interface AddToSeriesModalProps {
  isOpen: boolean;
  sheet: boolean;
  onClose: () => void;
  allSeries: Series[];
  videoUrl: string;
  videoTitle: string;
  onAddToSeries: (seriesId: string, season?: number, episodeNumber?: number) => Promise<void>;
  onCreateSeries: (name: string) => Promise<Series | null>;
}

export default function AddToSeriesModal({
  isOpen,
  sheet,
  onClose,
  allSeries,
  videoUrl,
  videoTitle,
  onAddToSeries,
  onCreateSeries,
}: AddToSeriesModalProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEpisodeInfo, setCurrentEpisodeInfo] = useState<ParsedEpisode | null>(null);

  useEffect(() => {
    if (isOpen && videoUrl) {
      // the user is explicitly building a series here, so accept looser episode numbering
      const parsed = parseEpisodeInfo(videoUrl, { loose: true });
      setCurrentEpisodeInfo(parsed);
      if (parsed) {
        setNewSeriesName(parsed.seriesName);
        setSelectedSeason(parsed.season ?? 1);
      }
    }
  }, [isOpen, videoUrl]);

  useEffect(() => {
    if (isOpen) {
      setMode(allSeries.length === 0 ? 'create' : 'select');
      setError(null);
    }
  }, [isOpen, allSeries.length]);

  const handleAddToExisting = async (seriesId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await onAddToSeries(seriesId, selectedSeason, currentEpisodeInfo?.episode);
      onClose();
    } catch {
      setError('Failed to add to series');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newSeriesName.trim()) {
      setError('Please enter a series name');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const series = await onCreateSeries(newSeriesName.trim());
      if (series) {
        await onAddToSeries(series.id, selectedSeason, currentEpisodeInfo?.episode);
        onClose();
      } else {
        setError('Failed to create series');
      }
    } catch {
      setError('Failed to create series');
    } finally {
      setIsLoading(false);
    }
  };

  const existingSeriesWithVideo = allSeries.find((s) => s.episodes.some((ep) => isSameMedia(ep.url, videoUrl)));
  const pad = sheet ? 'px-4' : 'px-5';

  return (
    <Dialog open={isOpen} onClose={onClose} sheet={sheet} label="Add to Series">
      {/* Header */}
      <div className={`${sheet ? 'px-4 pb-3 pt-1' : 'p-5'} border-b border-[rgba(44,36,32,0.4)] flex items-center justify-between flex-shrink-0`}>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-base font-semibold text-[#f0ece8]">Add to Series</h2>
          <p className="text-xs text-[#6b6560] mt-0.5 truncate" title={videoTitle}>
            {currentEpisodeInfo
              ? `${currentEpisodeInfo.seriesName} · ${currentEpisodeInfo.season ? `Season ${currentEpisodeInfo.season}, ` : ''}Episode ${currentEpisodeInfo.episode}`
              : videoTitle}
          </p>
        </div>
        <button onClick={onClose} className={`btn-icon ${sheet ? 'w-11 h-11' : 'w-8 h-8'} ml-3 flex-shrink-0`} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {existingSeriesWithVideo && (
        <div className={`${sheet ? 'mx-4' : 'mx-5'} mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex-shrink-0`}>
          <p className="text-xs text-yellow-500">This video is already in "{existingSeriesWithVideo.name}"</p>
        </div>
      )}

      {error && (
        <div className={`${sheet ? 'mx-4' : 'mx-5'} mt-4 p-3 bg-sw-accent/10 border border-sw-accent/30 rounded-xl flex-shrink-0`}>
          <p className="text-xs text-sw-accent">{error}</p>
        </div>
      )}

      <div className={`${pad} py-5 ${sheet ? '' : 'flex-1 overflow-y-auto'} space-y-4`}>
        {/* Mode tabs */}
        <div className="flex border-b border-[rgba(44,36,32,0.4)]">
          {(['select', 'create'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 ${sheet ? 'min-h-[44px]' : ''} py-2.5 text-xs font-medium text-center font-body transition-colors duration-200 border-b-2 border-transparent cursor-pointer ${
                mode === m ? 'text-[#f0ece8] border-b-sw-accent' : 'text-[#6b6560] hover:text-[#a39e99]'
              }`}
            >
              {m === 'select' ? 'Existing' : 'New Series'}
            </button>
          ))}
        </div>

        {/* Season */}
        <div className="p-3 bg-[#1e1a17] border border-[#2c2420] rounded-xl">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="add-series-season" className="text-xs font-medium text-[#a39e99]">Season for new episodes</label>
            <input
              id="add-series-season"
              type="number"
              inputMode="numeric"
              min="1"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Math.max(1, parseInt(e.target.value) || 1))}
              className="input w-20 px-3 py-1.5 text-center text-sm"
            />
          </div>
          {currentEpisodeInfo?.season && currentEpisodeInfo.season !== selectedSeason && (
            <p className="text-xs text-yellow-500 mt-2">Detected season {currentEpisodeInfo.season} from filename</p>
          )}
        </div>

        {mode === 'select' ? (
          <div className={`space-y-2 ${sheet ? '' : 'max-h-56 overflow-y-auto'}`}>
            {allSeries.length === 0 ? (
              <div className="text-center py-8 text-[#6b6560]">
                <Layers size={40} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">No series yet</p>
                <button onClick={() => setMode('create')} className="mt-2 text-sw-accent text-xs hover:underline min-h-[44px]">
                  Create your first series
                </button>
              </div>
            ) : (
              allSeries.map((series) => {
                const isAlreadyIn = series.episodes.some((ep) => isSameMedia(ep.url, videoUrl));
                return (
                  <button
                    key={series.id}
                    onClick={() => !isAlreadyIn && handleAddToExisting(series.id)}
                    disabled={isLoading || isAlreadyIn}
                    className={`w-full bg-[#1e1a17] border border-[#2c2420] rounded-xl p-3 text-left transition-colors ${
                      isAlreadyIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#2a2320] hover:border-[#3a322e] active:bg-[#2a2320]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-sw-accent/15 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Layers size={16} className="text-sw-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#f0ece8] truncate">{series.name}</p>
                        <p className="text-xs text-[#6b6560]">
                          {series.episodes.length} episode{series.episodes.length !== 1 ? 's' : ''}
                          {isAlreadyIn && ' • Already added'}
                        </p>
                      </div>
                      {!isAlreadyIn && <Plus size={16} className="text-[#6b6560] flex-shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="add-series-name" className="block text-xs font-medium text-[#a39e99] mb-2">Series Name</label>
              <input
                id="add-series-name"
                type="text"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="e.g., My Favorite Anime"
                className="input w-full"
                autoFocus={!sheet}
                enterKeyHint="done"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew(); }}
              />
            </div>
            <button
              onClick={handleCreateNew}
              disabled={isLoading || !newSeriesName.trim()}
              className={`btn-primary w-full flex items-center justify-center gap-2 ${sheet ? 'min-h-[44px]' : ''}`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create & Add Episode
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
