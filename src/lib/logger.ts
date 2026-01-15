/**
 * StreamWatch Logger
 * Provides consistent logging with timestamps and categories
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#888',
  info: '#4CAF50',
  warn: '#FF9800',
  error: '#F44336',
};

const CATEGORY_COLORS: Record<string, string> = {
  auth: '#2196F3',
  firestore: '#9C27B0',
  player: '#E91E63',
  popup: '#00BCD4',
  history: '#FF5722',
  hook: '#795548',
};

class Logger {
  private enabled = true;
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  private formatTime(): string {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  }

  private log(level: LogLevel, category: string, message: string, data?: unknown) {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: this.formatTime(),
      level,
      category,
      message,
      data,
    };

    // Store log
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with styling
    const levelColor = LOG_COLORS[level];
    const catColor = CATEGORY_COLORS[category] || '#666';

    const prefix = `%c[${entry.timestamp}]%c [${level.toUpperCase()}]%c [${category}]%c`;
    const styles = [
      'color: #888',
      `color: ${levelColor}; font-weight: bold`,
      `color: ${catColor}; font-weight: bold`,
      'color: inherit',
    ];

    if (data !== undefined) {
      console.log(prefix, ...styles, message, data);
    } else {
      console.log(prefix, ...styles, message);
    }
  }

  debug(category: string, message: string, data?: unknown) {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown) {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown) {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown) {
    this.log('error', category, message, data);
  }

  // Get all logs for debugging
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Clear logs
  clear() {
    this.logs = [];
    console.clear();
  }

  // Enable/disable logging
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

// Export singleton instance
export const logger = new Logger();

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  (window as unknown as { swLogger: Logger }).swLogger = logger;
}
