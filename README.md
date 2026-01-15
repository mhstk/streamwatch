# StreamWatch

Transform any video link into a Netflix-like streaming experience with watch history, series management, and cross-device sync.

![StreamWatch Player](https://img.shields.io/badge/Chrome-Extension-green)

## Features

- **Netflix-style Player** - Beautiful dark UI with Vidstack player
- **Watch Progress** - Auto-saves your position, resume where you left off
- **Series Management** - Organize videos into series with auto-detected episodes
- **Cross-device Sync** - Sign in with Google to sync across all your devices
- **Keyboard Shortcuts** - Space (play/pause), arrows (seek), F (fullscreen), M (mute)
- **Customizable** - Choose your accent color and playback preferences

## Installation

### Method 1: Download Release (Recommended)

1. Go to the [Releases page](../../releases)
2. Download the latest `StreamWatch-vX.X.X.zip`
3. Unzip the file
4. Open Chrome and go to `chrome://extensions`
5. Enable **Developer mode** (toggle in top right)
6. Click **Load unpacked**
7. Select the unzipped folder

### Method 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/streamwatch.git
cd streamwatch

# Install dependencies
npm install

# Build the extension
npm run build

# Load the dist/ folder as unpacked extension in Chrome
```

## Usage

1. **Right-click any video link** → "Play in StreamWatch"
2. Video opens in the StreamWatch player
3. Click **"Add to Series"** to organize episodes
4. Sign in with Google to sync your progress

## Updating

When a new version is released:
1. Download the new zip from Releases
2. Delete the old extension folder
3. Load the new unpacked folder in Chrome

## Development

```bash
# Install dependencies
npm install

# Start dev build (with watch)
npm run dev

# Production build
npm run build
```

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS
- Vidstack (video player)
- Firebase (auth & sync)
- Chrome Extension Manifest V3

## License

MIT
