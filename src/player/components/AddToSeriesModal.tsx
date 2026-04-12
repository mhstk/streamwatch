import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Layers, CheckCircle2 } from 'lucide-react';
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
        const related = findRelatedEpisodes(videoUrl, allUrls, 'all');

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      style={{ backdropFilter: 'blur(14px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#161210] border border-[rgba(44,36,32,0.4)] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] w-full max-w-lg animate-scale-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[rgba(44,36,32,0.4)] flex items-center justify-between flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-base font-semibold text-[#f0ece8]">Add to Series</h2>
            <p className="text-xs text-[#6b6560] mt-0.5 truncate" title={videoTitle}>
              {currentEpisodeInfo
                ? `${currentEpisodeInfo.seriesName} - Episode ${currentEpisodeInfo.episode}`
                : videoTitle}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon w-8 h-8 ml-3 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Already in series warning */}
        {existingSeriesWithVideo && (
          <div className="mx-5 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex-shrink-0">
            <p className="text-xs text-yellow-500">
              This video is already in "{existingSeriesWithVideo.name}"
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-[#B91C1C]/10 border border-[#B91C1C]/30 rounded-xl flex-shrink-0">
            <p className="text-xs text-[#B91C1C]">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Mode Tabs */}
          <div className="flex border-b border-[rgba(44,36,32,0.4)]">
            {(['select', 'create'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2.5 text-xs font-medium text-center font-body transition-colors duration-200 border-b-2 border-transparent cursor-pointer capitalize ${
                  mode === m
                    ? 'text-[#f0ece8] border-b-[#B91C1C]'
                    : 'text-[#6b6560] hover:text-[#a39e99]'
                }`}
              >
                {m === 'select' ? 'Existing' : 'New Series'}
              </button>
            ))}
            {detectedEpisodes.length > 0 && (
              <button
                onClick={() => setMode('auto')}
                className={`flex-1 py-2.5 text-xs font-medium text-center font-body transition-colors duration-200 border-b-2 border-transparent cursor-pointer relative ${
                  mode === 'auto'
                    ? 'text-[#f0ece8] border-b-[#B91C1C]'
                    : 'text-[#6b6560] hover:text-[#a39e99]'
                }`}
              >
                Auto-Add
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  {detectedEpisodes.length}
                </span>
              </button>
            )}
          </div>

          {/* Season selector - shown in all modes */}
          <div className="p-3 bg-[#1e1a17] border border-[#2c2420] rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-[#a39e99]">
                Season for new episodes
              </label>
              <input
                type="number"
                min="1"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Math.max(1, parseInt(e.target.value) || 1))}
                className="input w-20 px-3 py-1.5 text-center text-sm"
              />
            </div>
            {currentEpisodeInfo?.season && currentEpisodeInfo.season !== selectedSeason && (
              <p className="text-xs text-yellow-500 mt-2">
                Detected season {currentEpisodeInfo.season} from filename
              </p>
            )}
          </div>

          {/* Scanning indicator */}
          {isScanning && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
              <span className="text-xs text-blue-400">Scanning for related episodes...</span>
            </div>
          )}

          {mode === 'select' ? (
            /* Series List */
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {allSeries.length === 0 ? (
                <div className="text-center py-8 text-[#6b6560]">
                  <Layers size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No series yet</p>
                  <button
                    onClick={() => setMode('create')}
                    className="mt-2 text-[#B91C1C] text-xs hover:underline"
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
                      className={`w-full bg-[#1e1a17] border border-[#2c2420] rounded-xl p-3 text-left transition-colors ${
                        isAlreadyIn
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer hover:bg-[#2a2320] hover:border-[#3a322e]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#B91C1C]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Layers size={16} className="text-[#B91C1C]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#f0ece8] truncate">{series.name}</p>
                          <p className="text-xs text-[#6b6560]">
                            {series.episodes.length} episode{series.episodes.length !== 1 ? 's' : ''}
                            {isAlreadyIn && ' • Already added'}
                          </p>
                        </div>
                        {!isAlreadyIn && (
                          <Plus size={16} className="text-[#6b6560] flex-shrink-0" />
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
                <label className="block text-xs font-medium text-[#a39e99] mb-2">
                  Series Name
                </label>
                <input
                  type="text"
                  value={newSeriesName}
                  onChange={(e) => setNewSeriesName(e.target.value)}
                  placeholder="e.g., My Favorite Anime"
                  className="input w-full"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateNew();
                  }}
                />
              </div>

              <button
                onClick={handleCreateNew}
                disabled={isLoading || !newSeriesName.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2"
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
          ) : (
            /* Auto-Add Mode */
            <div className="space-y-4">
              {/* Current episode info */}
              {currentEpisodeInfo && (
                <div className="p-3 bg-[#B91C1C]/10 border border-[#B91C1C]/30 rounded-xl">
                  <p className="text-xs text-[#B91C1C] font-medium mb-0.5">Current Episode</p>
                  <p className="text-sm text-[#f0ece8]">
                    {currentEpisodeInfo.seriesName} - Episode {currentEpisodeInfo.episode}
                    {currentEpisodeInfo.season && ` (Season ${currentEpisodeInfo.season})`}
                  </p>
                </div>
              )}

              {/* Detected episodes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#a39e99]">
                    Detected Next Episodes ({selectedCount}/{detectedEpisodes.length})
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={selectAllEpisodes}
                      className="text-xs text-[#B91C1C] hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllEpisodes}
                      className="text-xs text-[#6b6560] hover:underline"
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
                      className={`w-full p-2 rounded-xl text-left transition-colors flex items-center gap-3 ${
                        ep.selected
                          ? 'bg-[rgba(185,28,28,0.07)] border border-[#B91C1C]/40'
                          : 'bg-[#1e1a17] border border-[#2c2420] hover:bg-[#2a2320]'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        ep.selected ? 'bg-[#B91C1C]' : 'bg-[#2c2420]'
                      }`}>
                        {ep.selected && (
                          <CheckCircle2 size={12} className="text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#f0ece8] truncate">
                          Episode {ep.episode}
                          {ep.season && ` (S${ep.season})`}
                        </p>
                        <p className="text-xs text-[#6b6560] truncate">{ep.originalFilename}</p>
                      </div>
                    </button>
                  ))}

                  {detectedEpisodes.length === 0 && !isScanning && (
                    <div className="text-center py-4 text-[#6b6560]">
                      <p className="text-sm">No additional episodes detected</p>
                      <p className="text-xs mt-1">Keep the source page tab open to detect more</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Matching series - only show if matches found and no series selected */}
              {matchingSeries.length > 0 && !selectedExistingSeries && (
                <div>
                  <label className="block text-xs font-medium text-[#a39e99] mb-2">
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
                          className={`w-full bg-[#1e1a17] border border-[#2c2420] rounded-xl p-2 text-left transition-colors flex items-center gap-3 ${
                            isAlreadyIn
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer hover:bg-[#2a2320] hover:border-[#3a322e]'
                          }`}
                        >
                          <div className="w-8 h-8 bg-[#B91C1C]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Layers size={14} className="text-[#B91C1C]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#f0ece8] truncate">{series.name}</p>
                            <p className="text-xs text-[#6b6560]">
                              {seasonCount} season{seasonCount !== 1 ? 's' : ''} • {series.episodes.length} ep
                              {isAlreadyIn && ' • Already added'}
                            </p>
                          </div>
                          {!isAlreadyIn && (
                            <Plus size={14} className="text-[#6b6560] flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected series indicator */}
              {selectedExistingSeries && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-green-400 font-medium mb-0.5">Adding to:</p>
                      <p className="text-sm text-[#f0ece8]">{selectedExistingSeries.name}</p>
                    </div>
                    <button
                      onClick={() => setSelectedExistingSeries(null)}
                      className="btn-icon w-7 h-7"
                      title="Change selection"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Only show create new section if no existing series selected */}
              {!selectedExistingSeries && (
                <>
                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#2c2420]" />
                    <span className="text-[10px] text-[#6b6560] tracking-wider">OR CREATE NEW</span>
                    <div className="flex-1 h-px bg-[#2c2420]" />
                  </div>

                  {/* Series name for creating new */}
                  <div>
                    <label className="block text-xs font-medium text-[#a39e99] mb-2">
                      New Series Name
                    </label>
                    <input
                      type="text"
                      value={newSeriesName}
                      onChange={(e) => setNewSeriesName(e.target.value)}
                      placeholder="e.g., My Favorite Anime"
                      className="input w-full"
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
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {selectedExistingSeries ? 'Adding...' : 'Creating...'}
                  </>
                ) : selectedExistingSeries ? (
                  <>
                    <Plus size={16} />
                    Add Season {selectedSeason} with {selectedCount + 1} Episodes
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create New Series with {selectedCount + 1} Episodes
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
