import { useState, useRef, useEffect } from 'react';
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
  onAddSubtitle: (source: SubtitleSource) => void;
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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [searchResults, setSearchResults] = useState<SubtitleSearchResult[]>([]);
  const [foundMovie, setFoundMovie] = useState<MovieSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Extract search terms from video title on mount
  // Use formatSearchQuery to keep season/episode info but remove quality/codec strings
  useEffect(() => {
    if (videoTitle && !searchQuery) {
      setSearchQuery(formatSearchQuery(videoTitle));
    }
  }, [videoTitle]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSearchError(null);
      setSearchResults([]);
      setHasSearched(false);
    }
  }, [isOpen]);

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
      const { cleanTitle, season, episode } = extractSearchTerms(searchQuery);
      const result = await searchSubtitles({
        query: cleanTitle,
        language: selectedLanguage,
        season: season,
        episode: episode,
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
      onAddSubtitle({
        type: 'search',
        data: blobUrl,
        label: `${result.languageName} - ${result.release}`,
        subtitleId: result.id,
        language: result.language,
        languageName: result.languageName,
        release: result.release,
      });
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
      onAddSubtitle({
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.replace(/\.(srt|vtt)$/i, '');
    onAddSubtitle({
      type: 'file',
      data: file,
      label: label.trim() || fileName || 'Subtitle',
    });
    setLabel('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    {
      id: 'search',
      label: 'Search',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      id: 'url',
      label: 'URL',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      id: 'file',
      label: 'File',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
        <div
          className="bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-700/50 pointer-events-auto animate-slide-up max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-sw-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Subtitles
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-sw-gray hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Current Subtitles */}
            {currentSubtitles.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-sw-gray">Active Subtitles</h3>
                <div className="space-y-1">
                  {/* Off option */}
                  <button
                    onClick={() => onSelectSubtitle(null)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                      activeSubtitleIndex === null
                        ? 'bg-sw-red/20 text-sw-red'
                        : 'bg-gray-800 text-white hover:bg-gray-700'
                    }`}
                  >
                    <span>Off</span>
                    {activeSubtitleIndex === null && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {currentSubtitles.map((sub, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                        activeSubtitleIndex === index
                          ? 'bg-sw-red/20 text-sw-red'
                          : 'bg-gray-800 text-white'
                      }`}
                    >
                      <button
                        onClick={() => onSelectSubtitle(index)}
                        className="flex-1 text-left hover:text-sw-red transition-colors truncate"
                      >
                        {sub.label}
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {activeSubtitleIndex === index && (
                          <svg className="w-4 h-4 text-sw-red" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        <button
                          onClick={() => onRemoveSubtitle(index)}
                          className="p-1 hover:bg-red-500/20 rounded transition-colors"
                          title="Remove subtitle"
                        >
                          <svg className="w-4 h-4 text-sw-gray hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-sw-red text-white'
                      : 'text-sw-gray hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Tab */}
            {activeTab === 'search' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Movie or TV show name..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sw-red transition-colors"
                  />
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sw-red transition-colors"
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
                  className="w-full py-2 bg-sw-red text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isSearching ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Search Subtitles
                    </>
                  )}
                </button>

                {searchError && (
                  <p className="text-red-500 text-sm text-center">{searchError}</p>
                )}

                {/* Found Movie */}
                {foundMovie && (
                  <div className="bg-gray-800/50 rounded-lg p-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-sw-red/20 rounded flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-sw-red" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{foundMovie.title}</p>
                      <p className="text-xs text-sw-gray">
                        {foundMovie.year} · {foundMovie.type === 'series' ? 'TV Series' : 'Movie'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <h4 className="text-sm font-medium text-sw-gray">
                      Found {searchResults.length} subtitle{searchResults.length !== 1 ? 's' : ''}
                    </h4>
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700/80 transition-colors"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-white text-sm font-medium truncate">
                            {result.release}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-sw-gray mt-1 flex-wrap">
                            <span className="bg-sw-red/20 text-sw-red px-1.5 py-0.5 rounded">
                              {result.languageName}
                            </span>
                            {result.hearingImpaired && (
                              <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded" title="Hearing Impaired">
                                HI
                              </span>
                            )}
                            <span>
                              <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              {result.downloadCount.toLocaleString()}
                            </span>
                            {result.rating > 0 && (
                              <span>
                                <svg className="w-3 h-3 inline mr-1 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                {result.rating.toFixed(1)}
                              </span>
                            )}
                            <span className="text-sw-gray/70">by {result.uploader}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownloadSubtitle(result)}
                          disabled={downloadingId === result.id}
                          className="px-3 py-1.5 bg-sw-red text-white text-sm rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-1 flex-shrink-0"
                        >
                          {downloadingId === result.id ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {hasSearched && searchResults.length === 0 && !isSearching && !searchError && (
                  <p className="text-sw-gray text-sm text-center py-4">
                    No results found. Try different search terms.
                  </p>
                )}

                <p className="text-xs text-sw-gray text-center">
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
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sw-red transition-colors"
                />
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label (e.g., English, Spanish)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sw-red transition-colors"
                />
                {error && (
                  <p className="text-red-500 text-sm">{error}</p>
                )}
                <button
                  onClick={handleUrlSubmit}
                  disabled={isLoading || !url.trim()}
                  className="w-full py-2 bg-sw-red text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
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
                <label
                  htmlFor="subtitle-file"
                  className="flex flex-col items-center justify-center gap-2 w-full py-8 bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg text-sw-light-gray hover:border-sw-red hover:text-white cursor-pointer transition-colors"
                >
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="font-medium">Choose SRT or VTT file</span>
                  <span className="text-xs text-sw-gray">or drag and drop</span>
                </label>
              </div>
            )}

            {/* Keyboard hint */}
            <p className="text-xs text-sw-gray text-center">
              Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px]">C</kbd> to toggle subtitles on/off
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
