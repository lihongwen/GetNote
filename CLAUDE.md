# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin project named "getnote-plugin" that converts voice input into transcribed text using AI. The plugin uses Alibaba Cloud's DashScope API with the qwen-audio-asr-latest model for accurate audio-to-text transcription.

### Current Status (Phase 2 Complete ✅)
- ✅ Basic plugin structure implemented
- ✅ Audio recording functionality using Web Audio API
- ✅ DashScope API integration with proper authentication
- ✅ CORS issues resolved using Obsidian's requestUrl() method
- ✅ API format corrected to match official documentation
- ✅ Plugin settings UI with API key configuration and testing
- ✅ Modular architecture with separate components
- ✅ Git repository initialized with first commit
- ✅ Upgraded to qwen-audio-asr-latest model for precise transcription
- ✅ Complete recording UI with start/pause/stop controls
- ✅ Modern, beautiful interface design with animations
- ✅ Real-time recording status and time display

### Key Features
- 🎙️ **Voice Recording**: Uses MediaRecorder API with configurable quality settings
- 🔗 **AI Integration**: Alibaba Cloud DashScope API with qwen-audio-asr-latest for precise audio-to-text conversion
- 📝 **Text Transcription**: Direct audio-to-text conversion without complex prompting
- ⚙️ **Settings UI**: API key management, model selection, output configuration
- 📁 **Organization**: Automatic saving to configurable vault folders
- 🎯 **Simple Format**: Clean text transcription with metadata
- 🎨 **Modern UI**: Beautiful recording modal with start/pause/stop controls
- ⏱️ **Real-time Display**: Live recording time and status indicators
- 🎭 **Animations**: Smooth status transitions and visual feedback
- 📱 **Responsive Design**: Optimized for both desktop and mobile devices

## Technical Requirements

- **NodeJS**: Minimum version 16+
- **TypeScript**: Required for type checking and development
- **API**: Depends on `obsidian.d.ts` TypeScript definitions with TSDoc comments
- **Build System**: esbuild for compilation and bundling

## Development Setup

1. **Essential Files to Create:**
   - `manifest.json` - Plugin metadata (required fields: id, name, version, minAppVersion, description, author)
   - `main.ts` - Main plugin entry point extending Plugin class
   - `package.json` - Dependencies and npm scripts
   - `tsconfig.json` - TypeScript configuration
   - `esbuild.config.mjs` - Build configuration
   - `versions.json` - Version compatibility matrix
   - `README.md` - Required for plugin submission
   - `styles.css` - Optional styling

2. **Development Commands:**
   ```bash
   npm install              # Install dependencies
   npm run dev              # Development build with watch mode
   npm run build            # Production build
   ```

## API Integration Details

### DashScope API Configuration
- **Endpoint**: `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- **Model**: `qwen-audio-asr-latest` (专门用于语音转文字)
- **Authentication**: Bearer token using API Key
- **Request Format**: Simplified format with only audio input, no text prompts needed
- **Content Types**: Supports audio (base64) - automatic transcription

### Audio Processing
- **Supported Formats**: WAV, MP3, M4A, FLAC, OGG
- **Size Limit**: 10MB maximum
- **Encoding**: Base64 for API transmission
- **Detection**: Automatic audio type detection from blob metadata

### Error Handling
- **CORS Resolution**: Use `requestUrl()` instead of `fetch()`
- **API Errors**: Detailed error messages with HTTP status codes
- **Network Issues**: Retry logic and user-friendly error messages
- **Validation**: API key format and audio file validation

## Plugin Manifest Structure

Required `manifest.json` structure:
```json
{
  "id": "plugin-id",           // Required: No "obsidian" in ID, keep short
  "name": "Plugin Name",       // Required: Display name
  "version": "1.0.0",          // Required: Semantic versioning
  "minAppVersion": "0.15.0",   // Required: Minimum Obsidian version
  "description": "Description", // Required: Used in plugin browser search
  "author": "Author Name",     // Required: Plugin author
  "authorUrl": "https://...",  // Optional: Author website
  "fundingUrl": "https://...", // Optional: Donation/funding link
  "isDesktopOnly": false       // Optional: true if NodeJS/CM5 required
}
```

## Plugin Architecture

- **Main Class**: Extends `Plugin` from `obsidian` module
- **Entry Point**: `main.ts` exports the plugin class
- **API Access**: Use Obsidian API for vault, UI, events, settings
- **Build Output**: Compiles to `main.js` for Obsidian to load
- **Hot Reload**: Requires Obsidian developer mode for development

## Plugin Capabilities

Common plugin features:
- Add ribbon icons and commands
- Create custom modals and settings tabs
- Register global events and workspace events
- Implement custom views and editor extensions
- Add status bar items and context menus

## Release and Submission Process

1. **Pre-Release:**
   - Update `manifest.json` version number
   - Update `versions.json` with compatibility info
   - Ensure README.md exists in repository root
   - Run build and verify `main.js`, `styles.css` generated

2. **GitHub Release:**
   - Create release with tag matching manifest version exactly (no 'v' prefix)
   - Upload `main.js`, `manifest.json`, `styles.css` as binary attachments
   - Include release notes

3. **Community Submission:**
   - Fork https://github.com/obsidianmd/obsidian-releases
   - Add plugin to end of `community-plugins.json` with unique ID
   - Submit pull request and complete submission checklist
   - ID in manifest must match ID in community-plugins.json

## Development Best Practices

- Check for existing similar plugins before development
- Use ESLint for code quality
- Follow semantic versioning
- Support mobile devices (set `isDesktopOnly: false` unless using NodeJS)
- Test on different Obsidian versions
- Provide clear documentation and examples

## Project Structure

```
├── main.ts              # Plugin main class
├── manifest.json        # Plugin metadata (required)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── versions.json        # Version compatibility
├── README.md           # Documentation (required for submission)
├── CLAUDE.md           # Development guidance for Claude Code
├── data.json           # Plugin settings storage
├── src/
│   ├── api-client.ts    # DashScope API integration
│   ├── recorder.ts      # Audio recording functionality (with pause/resume)
│   ├── note-generator.ts # Note creation and formatting
│   ├── settings.ts      # Plugin settings UI
│   └── recording-modal.ts # Recording control UI interface
└── styles.css          # Modern UI styles with animations
```

## Architecture Components

### Main Plugin (`main.ts`)
- Extends Obsidian's Plugin class
- Integrates all components (recorder, API client, note generator, UI modal)
- Manages plugin lifecycle and commands
- Handles ribbon icons and recording modal

### API Client (`src/api-client.ts`)
- DashScope API integration with qwen-audio-asr-latest model
- Simplified audio processing and base64 encoding
- Error handling and connection testing
- Support for multiple audio formats

### Audio Recorder (`src/recorder.ts`)
- Web Audio API integration with pause/resume support
- MediaRecorder with configurable quality
- Permission handling and format detection
- Real-time recording status and duration tracking

### Recording Modal (`src/recording-modal.ts`)
- Modern UI interface with start/pause/stop controls
- Real-time recording status indicators
- Live time display with accurate duration calculation
- State management for recording workflow

### Note Generator (`src/note-generator.ts`)
- Structured markdown note creation
- Template system for different note types
- Metadata and timestamp integration
- Vault folder management

### Settings UI (`src/settings.ts`)
- API key configuration and validation
- Audio quality and duration settings
- Model selection (qwen-audio-asr variants)
- Output folder configuration

## UI Design Features

### Recording Modal Interface
- **Modern Design**: Gradient backgrounds, rounded corners, and glass-morphism effects
- **Status Indicators**: Color-coded circular indicators with smooth animations
  - 🔘 Gray: Idle state
  - 🔴 Red pulsing: Recording active
  - 🟡 Orange blinking: Paused state
  - 🔵 Blue spinning: Processing
- **Interactive Controls**: Three main buttons with hover effects and disabled states
- **Time Display**: Large, monospace font with real-time updates
- **Responsive Layout**: Adapts to mobile and desktop screens

### Animation System
- **Pulse Effects**: Status indicators have contextual animations
- **Hover States**: Buttons lift and glow on interaction
- **Smooth Transitions**: All state changes are animated
- **Accessibility**: Respects `prefers-reduced-motion` setting

### Theme Support
- **Dark/Light Modes**: Automatically adapts to Obsidian themes
- **High Contrast**: Enhanced visibility for accessibility
- **Custom Variables**: Uses Obsidian's CSS custom properties

## Key Dependencies

- `obsidian` - Official Obsidian API types and interfaces
- `typescript` - TypeScript compiler for development
- `esbuild` - Fast build system for compilation
- `@typescript-eslint/eslint-plugin` - Code quality (recommended)

## Testing and Development

### Phase 1 Testing (Completed ✅)
- [x] Plugin loads without errors in Obsidian
- [x] Settings UI displays correctly
- [x] API connection test passes with valid API key
- [x] DashScope API format matches official documentation
- [x] CORS issues resolved with requestUrl() method

### Phase 2 Testing (Completed ✅)
- [x] Audio recording functionality with pause/resume
- [x] Complete audio-to-text workflow
- [x] Note generation and saving to vault
- [x] Modern UI interface design
- [x] Mobile device compatibility
- [x] Error handling edge cases

### Phase 3 Testing (Future Enhancement)
- [ ] Advanced note templates
- [ ] Batch audio processing
- [ ] Export/import settings functionality
- [ ] Performance optimization for long recordings
- [ ] Plugin marketplace submission

### Common Issues and Solutions

1. **CORS Errors**: Always use `requestUrl()` instead of `fetch()` for API calls
2. **API Format**: Ensure request includes `input` wrapper around `messages` array
3. **TypeScript Errors**: Update tsconfig.json target to ES2017 for modern methods
4. **Audio Permission**: Handle microphone permission requests gracefully
5. **File Saving**: Use Obsidian's vault API for proper file creation

## Official Resources

- **Developer Documentation**: https://docs.obsidian.md/
- **Sample Plugin**: https://github.com/obsidianmd/obsidian-sample-plugin
- **API Types**: https://github.com/obsidianmd/obsidian-api
- **Plugin Releases**: https://github.com/obsidianmd/obsidian-releases
- **DashScope API**: https://bailian.console.aliyun.com/
- **Official API Reference**: Model qwen-audio-turbo-latest documentation

## Development Notes for Claude Code

When continuing development:
1. Always test API connections first before implementing new features
2. Use the existing modular architecture for new components
3. Follow the established error handling patterns
4. Update this CLAUDE.md file with any significant changes
5. Run `npm run build` after code changes to test compilation
6. Use git commits with descriptive messages for version tracking