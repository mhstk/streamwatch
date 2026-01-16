// Subtitle parsing and conversion utilities

export interface SubtitleCue {
  index: number;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
}

// Parse SRT timestamp to seconds
// Format: 00:00:00,000 or 00:00:00.000
function parseSrtTime(timeStr: string): number {
  const parts = timeStr.trim().replace(',', '.').split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

// Format seconds to VTT timestamp
// Format: 00:00:00.000
function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
}

// Parse SRT content into cues
export function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Normalize line endings and split into blocks
  const blocks = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    // First line is index
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    // Second line is timestamp
    const timestampMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    if (!timestampMatch) continue;

    const startTime = parseSrtTime(timestampMatch[1]);
    const endTime = parseSrtTime(timestampMatch[2]);

    // Rest is text (may be multiple lines)
    const text = lines.slice(2).join('\n').trim();

    cues.push({ index, startTime, endTime, text });
  }

  return cues;
}

// Parse VTT content into cues
export function parseVtt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Remove WEBVTT header and normalize
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n');

  let i = 0;
  let cueIndex = 1;

  // Skip header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Look for timestamp line
    const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timestampMatch) {
      const startTime = parseSrtTime(timestampMatch[1]);
      const endTime = parseSrtTime(timestampMatch[2]);

      // Collect text lines
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        textLines.push(lines[i]);
        i++;
      }

      cues.push({
        index: cueIndex++,
        startTime,
        endTime,
        text: textLines.join('\n')
      });
    } else {
      i++;
    }
  }

  return cues;
}

// Convert SRT content to VTT format
export function srtToVtt(srtContent: string): string {
  const cues = parseSrt(srtContent);

  let vtt = 'WEBVTT\n\n';

  for (const cue of cues) {
    vtt += `${cue.index}\n`;
    vtt += `${formatVttTime(cue.startTime)} --> ${formatVttTime(cue.endTime)}\n`;
    vtt += `${cue.text}\n\n`;
  }

  return vtt;
}

// Detect subtitle format from content
export function detectSubtitleFormat(content: string): 'srt' | 'vtt' | 'unknown' {
  const trimmed = content.trim();
  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }
  // SRT typically starts with a number (cue index)
  if (/^\d+\s*\n/.test(trimmed)) {
    return 'srt';
  }
  return 'unknown';
}

// Create a blob URL for subtitle track
export function createSubtitleBlobUrl(content: string): string {
  const format = detectSubtitleFormat(content);

  let vttContent: string;
  if (format === 'srt') {
    vttContent = srtToVtt(content);
  } else if (format === 'vtt') {
    vttContent = content;
  } else {
    // Try to parse as SRT anyway
    vttContent = srtToVtt(content);
  }

  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

// Fetch subtitle from URL
export async function fetchSubtitle(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch subtitle: ${response.status}`);
  }
  return response.text();
}

// Read subtitle from file
export function readSubtitleFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
