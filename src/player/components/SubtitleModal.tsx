import { useState, useRef, useEffect } from 'react';
import { X, Search, Link, Upload, Download, Trash2, Check } from 'lucide-react';
import {
  searchSubtitles,
  downloadSubtitle,
  extractSubtitleFromZip,
  extractSearchTerms,
  formatSearchQuery,
  commonLanguages,
  SubtitleSearchResult,
  MovieSearchResult,
} from '@/lib/subtitleSearch';
import { createSubtitleBlobUrl } from '@/lib/subtitles';

export interface SubtitleSource {
  type: 'url' | 'file' | 'search';
  data: string | File;
  label: string;
  // Metadata for search results (to save preference)
  subtitleId?: number;
  language?: string;
  languageName?: string;
  release?: string;
}

interface SubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSubtitle: (source: SubtitleSource) => void | Promise<void>;
  currentSubtitles: { label: string; src: string }[];
  onRemoveSubtitle: (index: number) => void;
  activeSubtitleIndex: number | null;
  onSelectSubtitle: (index: number | null) => void;
  videoTitle?: string;
}

type Tab = 'search' | 'url' | 'file';

export default function SubtitleModal({
  isOpen,
  onClose,
  onAddSubtitle,
  currentSubtitles,
  onRemoveSubtitle,
  activeSubtitleIndex,
  onSelectSubtitle,
  videoTitle = '',
}: SubtitleModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const backdropPressRef = useRef(false);
  const [addedIds, setAddedIds] = useState<number[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [searchResults, setSearchResults] = useState<SubtitleSearchResult[]>([]);
  const [foundMovie, setFoundMovie] = useState<MovieSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Pre-fill the search box from the video title. Runs again when the video
  // changes, so the next episode doesn't keep the previous episode's query.
  useEffect(() => {
    setSearchQuery(videoTitle ? formatSearchQuery(videoTitle) : '');
    setSearchResults([]);
    setFoundMovie(null);
    setHasSearched(false);
    setAddedIds([]);
  }, [videoTitle]);

  // Reset transient state when the dialog closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSearchError(null);
    }
  }, [isOpen]);

  // Put the cursor in the search box as soon as the dialog (or the tab) opens
  useEffect(() => {
    if (isOpen && activeTab === 'search') {
      const id = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError('Please enter a search term');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    setFoundMovie(null);

    try {
      const { cleanTitle, season, episode, year } = extractSearchTerms(searchQuery);
      const result = await searchSubtitles({
        query: cleanTitle,
        language: selectedLanguage,
        season,
        episode,
        year,
      });
      setSearchResults(result.results);
      setFoundMovie(result.movie || null);
      if (result.results.length === 0) {
        setSearchError(result.movie
          ? `No ${selectedLanguage} subtitles found for "${result.movie.title}". Try a different language.`
          : 'No movies/shows found. Try different search terms.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownloadSubtitle = async (result: SubtitleSearchResult) => {
    setDownloadingId(result.id);
    setSearchError(null);

    try {
      // Download the ZIP file
      const zipBlob = await downloadSubtitle(result.id);

      // Extract the subtitle content from the ZIP
      const content = await extractSubtitleFromZip(zipBlob);

      // Create a blob URL for the subtitle
      const blobUrl = createSubtitleBlobUrl(content);

      // Add the subtitle with metadata for saving preference
      await onAddSubtitle({
        type: 'search',
        data: blobUrl,
        label: `${result.languageName} - ${result.release}`,
        subtitleId: result.id,
        language: result.language,
        languageName: result.languageName,
        release: result.release,
      });
      setAddedIds(prev => [...prev, result.id]);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUrlSubmit = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onAddSubtitle({
        type: 'url',
        data: url.trim(),
        label: label.trim() || 'Subtitle',
      });
      setUrl('');
      setLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subtitle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.replace(/\.(srt|vtt)$/i, '');
    setError(null);
    try {
      await onAddSubtitle({
        type: 'file',
        data: file,
        label: label.trim() || fileName || 'Subtitle',
      });
      setLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that subtitle file');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'search', label: 'Search', icon: <Search size={14} /> },
    { id: 'url',    label: 'URL',    icon: <Link size={14} /> },
    { id: 'file',   label: 'File',   icon: <Upload size={14} /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      style={{ backdropFilter: 'blur(14px)' }}
      // close only when the press started on the backdrop, not when a text
      // selection drag ends outside the dialog
      onMouseDown={(e) => { backdropPressRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (backdropPressRef.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[#161210] border border-[rgba(44,36,32,0.4)] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] w-full max-w-lg animate-scale-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[rgba(44,36,32,0.4)] flex items-center justify-between flex-shrink-0">
          <h2 className="font-heading text-base font-semibold text-[#f0ece8]">Subtitles</h2>
          <button onClick={onClose} className="btn-icon w-8 h-8">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Current Subtitles */}
          {currentSubtitles.length > 0 && (
            <div className="p-5 pb-0 space-y-2">
              <h3 className="text-xs font-medium text-[#6b6560] uppercase tracking-wider">Active Subtitles</h3>
              <div className="space-y-1">
                {/* Off option */}
                <button
                  onClick={() => onSelectSubtitle(null)}
                  className={`w-full flex items-center justify-between py-2.5 px-3 border-b border-[#1e1a17] transition-colors rounded-lg ${
                    activeSubtitleIndex === null
                      ? 'text-sw-accent bg-sw-accent/[0.07]'
                      : 'text-[#a39e99] hover:bg-[#1e1a17]'
                  }`}
                >
                  <span className="text-sm">Off</span>
                  {activeSubtitleIndex === null && <Check size={14} className="text-sw-accent" />}
                </button>

                {currentSubtitles.map((sub, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between py-2.5 px-3 border-b border-[#1e1a17] transition-colors rounded-lg ${
                      activeSubtitleIndex === index
                        ? 'text-sw-accent bg-sw-accent/[0.07]'
                        : 'text-[#f0ece8] hover:bg-[#1e1a17]'
                    }`}
                  >
                    <button
                      onClick={() => onSelectSubtitle(index)}
                      className="flex-1 text-left text-sm truncate hover:text-sw-accent transition-colors"
                    >
                      {sub.label}
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {activeSubtitleIndex === index && (
                        <Check size={14} className="text-sw-accent" />
                      )}
                      <button
                        onClick={() => onRemoveSubtitle(index)}
                        className="btn-icon w-6 h-6 text-[#6b6560] hover:text-sw-accent"
                        title="Remove subtitle"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-[rgba(44,36,32,0.4)] mt-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 text-xs font-medium text-center font-body transition-colors duration-200 border-b-2 border-transparent cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'text-[#f0ece8] border-b-sw-accent'
                    : 'text-[#6b6560] hover:text-[#a39e99]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {/* Search Tab */}
            {activeTab === 'search' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Movie or TV show name..."
                    className="input flex-1 min-w-0"
                  />
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="input px-3"
                  >
                    {commonLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {isSearching ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search size={15} />
                      Search Subtitles
                    </>
                  )}
                </button>

                {searchError && (
                  <p className="text-sw-accent text-xs text-center">{searchError}</p>
                )}

                {/* Found Movie */}
                {foundMovie && (
                  <div className="bg-[#1e1a17] border border-[#2c2420] rounded-xl p-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-sw-accent/15 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-sw-accent" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#f0ece8] font-medium truncate">{foundMovie.title}</p>
                      <p className="text-xs text-[#6b6560]">
                        {foundMovie.year} · {foundMovie.type === 'series' ? 'TV Series' : 'Movie'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    <h4 className="text-xs font-medium text-[#6b6560] mb-2">
                      Found {searchResults.length} subtitle{searchResults.length !== 1 ? 's' : ''}
                    </h4>
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="py-2.5 border-b border-[#1e1a17] flex items-center justify-between hover:bg-[#1e1a17] px-2 rounded-lg transition-colors"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm text-[#f0ece8] font-medium truncate">
                            {result.release}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[#6b6560] mt-1 flex-wrap">
                            <span className="bg-sw-accent/20 text-sw-accent px-1.5 py-0.5 rounded">
                              {result.languageName}
                            </span>
                            {result.hearingImpaired && (
                              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded" title="Hearing Impaired">
                                HI
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Download size={11} />
                              {result.downloadCount.toLocaleString()}
                            </span>
                            {result.rating > 0 && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                {result.rating.toFixed(1)}
                              </span>
                            )}
                            <span className="text-[#6b6560]/70">by {result.uploader}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownloadSubtitle(result)}
                          disabled={downloadingId !== null || addedIds.includes(result.id)}
                          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 flex-shrink-0 disabled:opacity-60 disabled:cursor-default"
                        >
                          {downloadingId === result.id ? (
                            <div className="w-3 h-3 border-2 border-[#f0ece8]/30 border-t-[#f0ece8] rounded-full animate-spin" />
                          ) : addedIds.includes(result.id) ? (
                            <Check size={13} className="text-green-400" />
                          ) : (
                            <Download size={13} />
                          )}
                          {addedIds.includes(result.id) ? 'Added' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {hasSearched && searchResults.length === 0 && !isSearching && !searchError && (
                  <p className="text-[#6b6560] text-xs text-center py-4">
                    No results found. Try different search terms.
                  </p>
                )}

                <p className="text-xs text-[#6b6560] text-center">
                  Powered by SubSource.net
                </p>
              </div>
            )}

            {/* URL Tab */}
            {activeTab === 'url' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/subtitle.srt"
                  className="input w-full"
                />
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label (e.g., English, Spanish)"
                  className="input w-full"
                />
                {error && (
                  <p className="text-sw-accent text-xs">{error}</p>
                )}
                <button
                  onClick={handleUrlSubmit}
                  disabled={isLoading || !url.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Link size={15} />
                      Add Subtitle
                    </>
                  )}
                </button>
              </div>
            )}

            {/* File Tab */}
            {activeTab === 'file' && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt,.vtt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="subtitle-file"
                />
                {error && (
                  <p className="text-sw-accent text-xs">{error}</p>
                )}
                <label
                  htmlFor="subtitle-file"
                  className="flex flex-col items-center justify-center gap-2 w-full py-8 bg-[#1e1a17] border-2 border-dashed border-[#2c2420] rounded-xl text-[#a39e99] hover:border-sw-accent hover:text-[#f0ece8] cursor-pointer transition-colors"
                >
                  <Upload size={36} />
                  <span className="text-sm font-medium">Choose SRT or VTT file</span>
                  <span className="text-xs text-[#6b6560]">or drag and drop</span>
                </label>
              </div>
            )}

            {/* Keyboard hint */}
            <p className="text-xs text-[#6b6560] text-center">
              Press <kbd className="px-1.5 py-0.5 bg-[#1e1a17] border border-[#2c2420] rounded text-[10px]">C</kbd> to toggle subtitles
              {' \u00b7 '}
              <kbd className="px-1.5 py-0.5 bg-[#1e1a17] border border-[#2c2420] rounded text-[10px]">Z</kbd>
              {' / '}
              <kbd className="px-1.5 py-0.5 bg-[#1e1a17] border border-[#2c2420] rounded text-[10px]">X</kbd> to shift timing
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
