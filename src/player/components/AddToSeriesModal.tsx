import { useState, useEffect, useCallback, useMemo } from 'react';
import { Series } from '@/types';
import { logger } from '@/lib/logger';
import { parseEpisodeInfo, findRelatedEpisodes, ParsedEpisode } from '@/lib/episodeParser';

// Simple fuzzy matching function
function fuzzyMatch(query: string, target: string): number {
  if (!query || !target) return 0;

  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  // Exact match
  if (q === t) return 1;

  // One contains the other
  if (t.includes(q) || q.includes(t)) return 0.9;

  // Token-based matching
  const qTokens = q.split(/[\s\-_\.]+/).filter(Boolean);
  const tTokens = t.split(/[\s\-_\.]+/).filter(Boolean);

  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  // Count matching tokens
  let matches = 0;
  for (const qt of qTokens) {
    for (const tt of tTokens) {
      if (qt === tt || tt.includes(qt) || qt.includes(tt)) {
        matches++;
        break;
      }
    }
  }

  // Score based on proportion of matching tokens
  return matches / Math.max(qTokens.length, tTokens.length);
}

interface AddToSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  allSeries: Series[];
  videoUrl: string;
  videoTitle: string;
  onAddToSeries: (seriesId: string, season?: number, episodeNumber?: number) => Promise<void>;
  onCreateSeries: (name: string) => Promise<Series | null>;
  onAddEpisodeToSeries: (seriesId: string, url: string, title: string, season?: number, episodeNumber?: number) => Promise<void>;
}

interface DetectedEpisode extends ParsedEpisode {
  selected: boolean;
}

export default function AddToSeriesModal({
  isOpen,
  onClose,
  allSeries,
  videoUrl,
  videoTitle,
  onAddToSeries,
  onCreateSeries,
  onAddEpisodeToSeries,
}: AddToSeriesModalProps) {
  const [mode, setMode] = useState<'select' | 'create' | 'auto'>('select');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect state
  const [isScanning, setIsScanning] = useState(false);
  const [detectedEpisodes, setDetectedEpisodes] = useState<DetectedEpisode[]>([]);
  const [currentEpisodeInfo, setCurrentEpisodeInfo] = useState<ParsedEpisode | null>(null);

  // Selected existing series for auto mode (selection-based UX)
  const [selectedExistingSeries, setSelectedExistingSeries] = useState<Series | null>(null);

  // Compute matching series based on fuzzy match with new series name
  const matchingSeries = useMemo(() => {
    if (!newSeriesName.trim()) return [];

    const matches = allSeries
      .map(series => ({
        series,
        score: fuzzyMatch(newSeriesName, series.name),
      }))
      .filter(({ score }) => score >= 0.5) // Only show high confidence matches
      .sort((a, b) => b.score - a.score);

    return matches.map(m => m.series);
  }, [newSeriesName, allSeries]);

  // Define scanForEpisodes BEFORE the useEffect that uses it
  const scanForEpisodes = useCallback(async () => {
    console.log('[StreamWatch] scanForEpisodes called!');
    setIsScanning(true);
    logger.info('player', 'Scanning for episodes...', { videoUrl });

    try {
      // Request background script to scan the source page
      const response = await new Promise<{
        success: boolean;
        allLinks?: { url: string; text: string; title: string; filename: string }[];
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'SCAN_SOURCE_PAGE', payload: { videoUrl } },
          resolve
        );
      });

      // DEBUG: Log full response
      console.log('[StreamWatch] SCAN_SOURCE_PAGE response:', response);

      if (response.success && response.allLinks) {
        const allUrls = response.allLinks.map(l => l.url);
        logger.info('player', 'Found video links on page', { count: allUrls.length });

        // DEBUG: Log all found links
        console.log('[StreamWatch] All video links found:', response.allLinks);
        console.log('[StreamWatch] Current video URL:', videoUrl);

        // DEBUG: Log current episode info
        const currentParsed = parseEpisodeInfo(videoUrl);
        console.log('[StreamWatch] Parsed current episode:', currentParsed);

        // Find related episodes
        const related = findRelatedEpisodes(videoUrl, allUrls, 'next');

        // DEBUG: Log related episodes
        console.log('[StreamWatch] Related episodes found:', related);

        // Convert to DetectedEpisode with selected state
        const detected: DetectedEpisode[] = related.map(ep => ({
          ...ep,
          selected: true, // Select all by default
        }));

        setDetectedEpisodes(detected);
        logger.info('player', 'Detected related episodes', { count: detected.length });

        // If we found episodes, suggest auto mode
        if (detected.length > 0) {
          // Keep in select mode but show the auto-detect option
        }
      } else {
        logger.warn('player', 'Failed to scan for episodes', { error: response.error });
        console.log('[StreamWatch] Scan failed:', response);
      }
    } catch (err) {
      logger.error('player', 'Error scanning for episodes', err);
      console.error('[StreamWatch] Error:', err);
    } finally {
      setIsScanning(false);
    }
  }, [videoUrl]);

  // Parse current episode on mount
  useEffect(() => {
    if (isOpen && videoUrl) {
      const parsed = parseEpisodeInfo(videoUrl);
      setCurrentEpisodeInfo(parsed);

      if (parsed) {
        setNewSeriesName(parsed.seriesName);
        setSelectedSeason(parsed.season ?? 1);
      }
    }
  }, [isOpen, videoUrl]);

  // Scan for episodes when modal opens
  useEffect(() => {
    console.log('[StreamWatch] useEffect triggered, isOpen:', isOpen, 'videoUrl:', videoUrl);
    if (isOpen && videoUrl) {
      console.log('[StreamWatch] Calling scanForEpisodes...');
      scanForEpisodes();
    }
  }, [isOpen, videoUrl, scanForEpisodes]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(allSeries.length === 0 ? 'create' : 'select');
      setError(null);
      setSelectedExistingSeries(null);
    } else {
      // Reset on close
      setDetectedEpisodes([]);
      setIsScanning(false);
      setSelectedExistingSeries(null);
    }
  }, [isOpen, allSeries.length]);

  const handleAddToExisting = async (seriesId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Add current video with season info
      await onAddToSeries(seriesId, selectedSeason, currentEpisodeInfo?.episode);

      // If in auto mode, add selected episodes
      if (mode === 'auto') {
        const selectedEpisodes = detectedEpisodes.filter(ep => ep.selected);
        for (const ep of selectedEpisodes) {
          await addEpisodeToSeriesById(seriesId, ep.url, ep.title, ep.season ?? selectedSeason, ep.episode);
        }
        logger.info('player', 'Added episodes to series', {
          seriesId,
          count: selectedEpisodes.length + 1
        });
      }

      logger.info('player', 'Added to existing series', { seriesId, videoTitle, season: selectedSeason });
      onClose();
    } catch (err) {
      setError('Failed to add to series');
      logger.error('player', 'Failed to add to series', err);
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
        // Add current video with season info
        await onAddToSeries(series.id, selectedSeason, currentEpisodeInfo?.episode);

        // If in auto mode, add selected episodes
        if (mode === 'auto') {
          const selectedEpisodes = detectedEpisodes.filter(ep => ep.selected);
          for (const ep of selectedEpisodes) {
            await addEpisodeToSeriesById(series.id, ep.url, ep.title, ep.season ?? selectedSeason, ep.episode);
          }
          logger.info('player', 'Created series with auto-detected episodes', {
            seriesName: newSeriesName,
            episodeCount: selectedEpisodes.length + 1,
            season: selectedSeason
          });
        } else {
          logger.info('player', 'Created series and added video', {
            seriesName: newSeriesName,
            videoTitle,
            season: selectedSeason
          });
        }

        onClose();
      }
    } catch (err) {
      setError('Failed to create series');
      logger.error('player', 'Failed to create series', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to add episode by series ID
  const addEpisodeToSeriesById = async (seriesId: string, url: string, title: string, season?: number, episodeNumber?: number) => {
    await onAddEpisodeToSeries(seriesId, url, title, season, episodeNumber);
  };

  const toggleEpisode = (index: number) => {
    setDetectedEpisodes(prev =>
      prev.map((ep, i) => i === index ? { ...ep, selected: !ep.selected } : ep)
    );
  };

  const selectAllEpisodes = () => {
    setDetectedEpisodes(prev => prev.map(ep => ({ ...ep, selected: true })));
  };

  const deselectAllEpisodes = () => {
    setDetectedEpisodes(prev => prev.map(ep => ({ ...ep, selected: false })));
  };

  if (!isOpen) return null;

  // Check if video is already in a series
  const existingSeriesWithVideo = allSeries.find(s =>
    s.episodes.some(ep => ep.url === videoUrl)
  );

  const selectedCount = detectedEpisodes.filter(ep => ep.selected).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-700/50 pointer-events-auto animate-slide-up max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-700/50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add to Series</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-sw-gray mt-1 truncate" title={videoTitle}>
              {currentEpisodeInfo
                ? `${currentEpisodeInfo.seriesName} - Episode ${currentEpisodeInfo.episode}`
                : videoTitle}
            </p>
          </div>

          {/* Already in series warning */}
          {existingSeriesWithVideo && (
            <div className="mx-4 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex-shrink-0">
              <p className="text-sm text-yellow-500">
                This video is already in "{existingSeriesWithVideo.name}"
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex-shrink-0">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Content */}
          <div className="p-4 flex-1 overflow-y-auto">
            {/* Mode Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode('select')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  mode === 'select'
                    ? 'bg-sw-red text-white'
                    : 'bg-gray-800 text-sw-gray hover:text-white'
                }`}
              >
                Existing
              </button>
              <button
                onClick={() => setMode('create')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  mode === 'create'
                    ? 'bg-sw-red text-white'
                    : 'bg-gray-800 text-sw-gray hover:text-white'
                }`}
              >
                New
              </button>
              {detectedEpisodes.length > 0 && (
                <button
                  onClick={() => setMode('auto')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all relative ${
                    mode === 'auto'
                      ? 'bg-sw-red text-white'
                      : 'bg-gray-800 text-sw-gray hover:text-white'
                  }`}
                >
                  Auto-Add
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center">
                    {detectedEpisodes.length}
                  </span>
                </button>
              )}
            </div>

            {/* Season selector - shown in all modes */}
            <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-sw-light-gray">
                  Season for new episodes
                </label>
                <input
                  type="number"
                  min="1"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-center focus:outline-none focus:border-sw-red transition-colors"
                />
              </div>
              {currentEpisodeInfo?.season && currentEpisodeInfo.season !== selectedSeason && (
                <p className="text-xs text-yellow-500 mt-1">
                  Detected season {currentEpisodeInfo.season} from filename
                </p>
              )}
            </div>

            {/* Scanning indicator */}
            {isScanning && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-sm text-blue-400">Scanning for related episodes...</span>
              </div>
            )}

            {mode === 'select' ? (
              /* Series List */
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {allSeries.length === 0 ? (
                  <div className="text-center py-8 text-sw-gray">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-sm">No series yet</p>
                    <button
                      onClick={() => setMode('create')}
                      className="mt-2 text-sw-red text-sm hover:underline"
                    >
                      Create your first series
                    </button>
                  </div>
                ) : (
                  allSeries.map((series) => {
                    const isAlreadyIn = series.episodes.some(ep => ep.url === videoUrl);
                    return (
                      <button
                        key={series.id}
                        onClick={() => !isAlreadyIn && handleAddToExisting(series.id)}
                        disabled={isLoading || isAlreadyIn}
                        className={`w-full p-3 rounded-lg text-left transition-all ${
                          isAlreadyIn
                            ? 'bg-gray-800/50 opacity-50 cursor-not-allowed'
                            : 'bg-gray-800/50 hover:bg-gray-800 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-sw-red/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-sw-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{series.name}</p>
                            <p className="text-xs text-sw-gray">
                              {series.episodes.length} episode{series.episodes.length !== 1 ? 's' : ''}
                              {isAlreadyIn && ' • Already added'}
                            </p>
                          </div>
                          {!isAlreadyIn && (
                            <svg className="w-5 h-5 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : mode === 'create' ? (
              /* Create New Series */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sw-light-gray mb-2">
                    Series Name
                  </label>
                  <input
                    type="text"
                    value={newSeriesName}
                    onChange={(e) => setNewSeriesName(e.target.value)}
                    placeholder="e.g., My Favorite Anime"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-sw-gray focus:outline-none focus:border-sw-red transition-colors"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNew();
                    }}
                  />
                </div>

                <button
                  onClick={handleCreateNew}
                  disabled={isLoading || !newSeriesName.trim()}
                  className="w-full py-3 px-4 bg-sw-red text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create & Add Episode
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Auto-Add Mode */
              <div className="space-y-4">
                {/* Current episode info */}
                {currentEpisodeInfo && (
                  <div className="p-3 bg-sw-red/10 border border-sw-red/30 rounded-lg">
                    <p className="text-sm text-sw-red font-medium">Current Episode</p>
                    <p className="text-white">
                      {currentEpisodeInfo.seriesName} - Episode {currentEpisodeInfo.episode}
                      {currentEpisodeInfo.season && ` (Season ${currentEpisodeInfo.season})`}
                    </p>
                  </div>
                )}

                {/* Detected episodes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-sw-light-gray">
                      Detected Next Episodes ({selectedCount}/{detectedEpisodes.length})
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllEpisodes}
                        className="text-xs text-sw-red hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        onClick={deselectAllEpisodes}
                        className="text-xs text-sw-gray hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {detectedEpisodes.map((ep, index) => (
                      <button
                        key={ep.url}
                        onClick={() => toggleEpisode(index)}
                        className={`w-full p-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                          ep.selected
                            ? 'bg-sw-red/20 border border-sw-red/50'
                            : 'bg-gray-800/50 hover:bg-gray-800'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          ep.selected ? 'bg-sw-red' : 'bg-gray-700'
                        }`}>
                          {ep.selected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">
                            Episode {ep.episode}
                            {ep.season && ` (S${ep.season})`}
                          </p>
                          <p className="text-xs text-sw-gray truncate">{ep.originalFilename}</p>
                        </div>
                      </button>
                    ))}

                    {detectedEpisodes.length === 0 && !isScanning && (
                      <div className="text-center py-4 text-sw-gray">
                        <p className="text-sm">No additional episodes detected</p>
                        <p className="text-xs mt-1">Keep the source page tab open to detect more</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Matching series - only show if matches found and no series selected */}
                {matchingSeries.length > 0 && !selectedExistingSeries && (
                  <div>
                    <label className="block text-sm font-medium text-sw-light-gray mb-2">
                      Add to Existing Series
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {matchingSeries.map((series) => {
                        const isAlreadyIn = series.episodes.some(ep => ep.url === videoUrl);
                        const seasons = new Set(series.episodes.map(ep => ep.season ?? 1));
                        const seasonCount = seasons.size;
                        return (
                          <button
                            key={series.id}
                            onClick={() => !isAlreadyIn && setSelectedExistingSeries(series)}
                            disabled={isLoading || isAlreadyIn}
                            className={`w-full p-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                              isAlreadyIn
                                ? 'bg-gray-800/30 opacity-50 cursor-not-allowed'
                                : 'bg-gray-800/50 hover:bg-gray-800 cursor-pointer'
                            }`}
                          >
                            <div className="w-8 h-8 bg-sw-red/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-sw-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{series.name}</p>
                              <p className="text-xs text-sw-gray">
                                {seasonCount} season{seasonCount !== 1 ? 's' : ''} • {series.episodes.length} ep
                                {isAlreadyIn && ' • Already added'}
                              </p>
                            </div>
                            {!isAlreadyIn && (
                              <svg className="w-4 h-4 text-sw-gray flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected series indicator */}
                {selectedExistingSeries && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-400 font-medium">Adding to:</p>
                        <p className="text-white">{selectedExistingSeries.name}</p>
                      </div>
                      <button
                        onClick={() => setSelectedExistingSeries(null)}
                        className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Change selection"
                      >
                        <svg className="w-4 h-4 text-sw-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Only show create new section if no existing series selected */}
                {!selectedExistingSeries && (
                  <>
                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-gray-700" />
                      <span className="text-xs text-sw-gray">OR CREATE NEW</span>
                      <div className="flex-1 h-px bg-gray-700" />
                    </div>

                    {/* Series name for creating new */}
                    <div>
                      <label className="block text-sm font-medium text-sw-light-gray mb-2">
                        New Series Name
                      </label>
                      <input
                        type="text"
                        value={newSeriesName}
                        onChange={(e) => setNewSeriesName(e.target.value)}
                        placeholder="e.g., My Favorite Anime"
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-sw-gray focus:outline-none focus:border-sw-red transition-colors"
                      />
                    </div>
                  </>
                )}

                {/* Action button - changes based on selection */}
                <button
                  onClick={() => {
                    if (selectedExistingSeries) {
                      handleAddToExisting(selectedExistingSeries.id);
                    } else {
                      handleCreateNew();
                    }
                  }}
                  disabled={isLoading || (!selectedExistingSeries && !newSeriesName.trim())}
                  className="w-full py-3 px-4 bg-sw-red text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {selectedExistingSeries ? 'Adding...' : 'Creating...'}
                    </>
                  ) : selectedExistingSeries ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Season {selectedSeason} with {selectedCount + 1} Episodes
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create New Series with {selectedCount + 1} Episodes
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
