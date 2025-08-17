# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin project named "getnote-plugin" that creates rich multimodal notes by combining voice recordings and image uploads with AI processing. The plugin uses Alibaba Cloud's DashScope API with multiple models: qwen-audio-asr-latest for audio transcription, qwen-vl-ocr-latest for image OCR, and qwen-plus-latest for content analysis and enhancement.

### Current Status (Phase 8 Complete - Note Template Optimization ✅)
- ✅ Basic plugin structure implemented
- ✅ Audio recording functionality using Web Audio API
- ✅ DashScope API integration with proper authentication
- ✅ CORS issues resolved using Obsidian's requestUrl() method
- ✅ API format corrected to match official documentation
- ✅ Plugin settings UI with API key configuration and testing
- ✅ Modular architecture with separate components
- ✅ Git repository initialized with continuous commits
- ✅ Upgraded to qwen-audio-asr-latest model for precise transcription
- ✅ Complete recording UI with start/pause/stop controls
- ✅ Modern, beautiful interface design with animations
- ✅ Real-time recording status and time display
- ✅ Simplified four-button UI design (Start/Pause/Stop/Cancel)
- ✅ Semantic color scheme with intuitive button meanings
- ✅ Streamlined state management (idle/recording/paused)
- ✅ Enhanced user experience with minimal cognitive load
- ✅ Responsive design optimized for all devices
- ✅ LLM text processing with qwen-plus-latest model
- ✅ Automatic text optimization and grammar correction
- ✅ AI-generated tags based on content analysis
- ✅ Dual API testing (speech + text models)
- ✅ Enhanced recording states (transcribing/processing/saving)
- ✅ Fallback mechanism for LLM processing failures
- ✅ Optional LLM processing with settings toggle
- ✅ Smart cancel confirmation system
- ✅ Close dialog with state-aware confirmation messages
- ✅ Cancel button in recording interface
- ✅ API processing cancellation mechanism
- ✅ Graceful resource cleanup on cancel
- ✅ **Phase 6 Complete**: Note style modification features
- ✅ **Phase 6 Complete**: Recording cancellation bug fixes
- ✅ **Phase 6 Complete**: Stack overflow error resolution
- ✅ **Phase 7 Complete**: Complete multimodal image OCR functionality
  - ✅ Image upload with drag-and-drop support
  - ✅ Thumbnail generation and preview
  - ✅ OCR processing using qwen-vl-ocr-latest model
  - ✅ Combined audio + image LLM processing
  - ✅ Comprehensive error handling and validation
  - ✅ Batch processing with timeout mechanisms
  - ✅ Recoverable error retry systems
  - ✅ Image format validation and size limits
  - ✅ Multimodal note generation with image integration
- ✅ **Phase 8 Complete**: Note Template Optimization and Enhancement
  - ✅ Card-based note layout with user thoughts and AI analysis sections
  - ✅ Enhanced YAML front matter with structured metadata
  - ✅ Intelligent title generation based on content analysis
  - ✅ Improved multimodal content rendering
  - ✅ Optimized note templates for different content types
  - ✅ Better organization of audio, OCR, and AI-processed content
  - ✅ Wake Lock API integration for preventing screen lock during recording

### Key Features
- 🎙️ **Voice Recording**: Uses MediaRecorder API with configurable quality settings and Wake Lock support
- 🖼️ **Image OCR**: Upload and process images with qwen-vl-ocr-latest for text recognition
- 🔗 **AI Integration**: Alibaba Cloud DashScope API with qwen-audio-asr-latest for precise audio-to-text conversion
- 🎯 **Multimodal Processing**: Combined audio transcription + image OCR with unified LLM analysis
- 📝 **Text Transcription**: Direct audio-to-text conversion with precise model selection
- 🤖 **LLM Text Processing**: Optional AI text optimization using qwen-plus-latest model
- 🏷️ **Auto Tag Generation**: AI-powered content analysis and structured tag creation
- ⚙️ **Settings UI**: Comprehensive API key management, model selection, output configuration, and testing
- 📁 **Organization**: Automatic saving to configurable vault folders with enhanced metadata
- 🎯 **Smart Format**: Clean text transcription with AI optimization and card-based structured notes
- 🎨 **Simplified UI**: Four-button interface (Start/Pause/Stop/Cancel) with 7 processing states
- ⏱️ **Clear Status**: Enhanced status indicators for recording/transcribing/ocr-processing/processing/saving
- 🌈 **Semantic Colors**: Green=Start, Orange=Pause, Red=Stop, Gray=Cancel for immediate recognition
- 📱 **Responsive Design**: Optimized for both desktop and mobile devices
- ♿ **Accessibility**: Full keyboard navigation and high contrast support
- 🔄 **Robust Processing**: Fallback mechanisms and retry logic for reliable operation
- 🛡️ **Smart Cancellation**: State-aware confirmation dialogs prevent accidental data loss
- 🔚 **Graceful Exit**: Clean resource cleanup and API cancellation on user abort
- 🔒 **Wake Lock**: Prevents screen lock during long recording sessions

## Technical Requirements

- **NodeJS**: Minimum version 16+
- **TypeScript**: Required for type checking and development
- **API**: Depends on `obsidian.d.ts` TypeScript definitions with TSDoc comments
- **Build System**: esbuild for compilation and bundling

## Development Commands

Essential commands for this codebase:

```bash
# Setup
npm install              # Install dependencies

# Development  
npm run dev              # Development build with watch mode (esbuild + watch)
npm run build            # Production build (TypeScript check + esbuild production)

# Version management
npm run version          # Bump version and update manifest.json/versions.json

# Debug and testing
# No formal test suite - testing done via manual Obsidian plugin loading
# Debug via Chrome DevTools when plugin is loaded in Obsidian
```

## TypeScript Configuration

- **Target**: ES2017 (required for modern JavaScript features)
- **Module**: ESNext with ES2018 esbuild compilation  
- **Build**: esbuild for fast compilation, TypeScript for type checking only (`tsc -noEmit`)
- **Hot Reload**: Available in development mode via `npm run dev`

## API Integration Details

### DashScope API Integration

This plugin integrates with **Alibaba Cloud's DashScope API** using three models:

1. **Speech-to-Text**: `qwen-audio-asr-latest`
   - Endpoint: `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
   - Input: Base64 encoded audio (WAV/MP3/M4A/FLAC/OGG, max 10MB)
   - Output: Transcribed text

2. **Image OCR**: `qwen-vl-ocr-latest`
   - Same endpoint, different model parameter
   - Input: Base64 encoded images (JPEG/PNG/GIF/WebP, max 10MB)
   - Output: Extracted text from images

3. **Text Processing**: `qwen-plus-latest` (optional)
   - Compatible mode endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
   - Input: Raw transcribed text or combined multimodal text
   - Output: Optimized text + AI-generated tags + structured metadata

**Critical**: Must use Obsidian's `requestUrl()` instead of `fetch()` to avoid CORS issues.

## Project Structure

```
├── main.ts              # Plugin main class with complete multimodal processing pipeline
├── manifest.json        # Plugin metadata (required)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── versions.json        # Version compatibility
├── README.md           # Documentation (required for submission)
├── CLAUDE.md           # Development guidance for Claude Code
├── data.json           # Plugin settings storage with actual user configurations
├── src/
│   ├── api-client.ts    # DashScope API integration (speech + OCR + text models)
│   ├── recorder.ts      # Audio recording functionality with Wake Lock support
│   ├── image-manager.ts # Complete image upload, validation, thumbnail generation, and batch processing
│   ├── note-generator.ts # Enhanced multimodal note creation with card-based templates
│   ├── settings.ts      # Comprehensive plugin settings UI (speech + OCR + text + Wake Lock testing)
│   ├── recording-modal.ts # Advanced recording control UI with image upload and 7-state management
│   ├── text-processor.ts # Enhanced multimodal LLM processing with structured tag generation
│   └── types.ts         # Complete TypeScript interfaces for multimodal content and processing
└── styles.css          # Complete UI styles including all components and states
```

## Core Architecture

The plugin follows a **mature modular architecture** with clear separation of concerns:

```
main.ts                  # Plugin entry point, coordinates complete multimodal processing pipeline
├── src/api-client.ts    # DashScope API integration (3 models: audio + OCR + text)  
├── src/recorder.ts      # Web Audio API recording with Wake Lock support
├── src/image-manager.ts # Complete image management: validation, thumbnails, batch processing, error recovery
├── src/recording-modal.ts # Advanced UI modal: audio recording + image upload + 7-state management
├── src/note-generator.ts # Enhanced multimodal note creation: card-based layout, structured content
├── src/text-processor.ts # Advanced multimodal LLM processing: content analysis, tag generation
├── src/types.ts         # Complete TypeScript interfaces for all multimodal functionality
└── src/settings.ts      # Comprehensive plugin configuration: all models, features, testing
```

### Key Architectural Patterns

1. **Triple API Integration**: `DashScopeClient` handles three models - `qwen-audio-asr-latest` for speech, `qwen-vl-ocr-latest` for OCR, and `qwen-plus-latest` for text processing
2. **Advanced State Management**: Recording modal manages 7 states (idle/recording/paused/saving-audio/transcribing/ocr-processing/processing/saving) with intelligent cancellation
3. **Comprehensive Error Handling**: Multi-layer validation, timeout handling, and recovery mechanisms with detailed user feedback
4. **Enhanced Image Management**: `ImageManager` provides validation, thumbnail generation, batch processing with detailed progress tracking
5. **Advanced Multimodal Processing**: `TextProcessor` combines audio + OCR text for unified LLM analysis with structured tag generation
6. **Six-Stage Processing Pipeline**: Audio recording → transcription → image OCR → combined LLM analysis → file saving → enhanced note generation
7. **Wake Lock Integration**: Prevents screen lock during recording sessions for better user experience

### Multimodal Data Flow

1. **Audio Recording**: `AudioRecorder` with Wake Lock → MediaRecorder blob → base64 encoding → `qwen-audio-asr-latest`
2. **Image Processing**: `ImageManager` → validation → thumbnail generation → base64 encoding → `qwen-vl-ocr-latest`
3. **Content Combination**: Audio text + OCR text → structured multimodal content object
4. **LLM Enhancement**: Combined content → `qwen-plus-latest` → enhanced text + structured tags + summary + smart title
5. **Vault Integration**: Images saved to vault → relative paths → enhanced multimodal note generation → card-based markdown
6. **Cancellation**: `isProcessingCancelled` flag with cleanup at each stage

### Critical Implementation Details

- **CORS Workaround**: All API calls MUST use `requestUrl()` from Obsidian API, never `fetch()`
- **Dual API Interfaces**: `DashScopeRequest` for audio/OCR, `CompatibleRequest` for text processing
- **Settings Integration**: Plugin settings stored in `data.json`, loaded via `loadData()`/`saveData()`
- **Error Recovery**: Multi-layer fallback system with detailed error reporting
- **Resource Management**: Audio files optionally saved alongside notes when `keepOriginalAudio` enabled
- **Wake Lock Support**: Prevents screen lock during recording using native Web API

## UI Design Features

### Recording Modal Interface (Phase 8 - Enhanced Template Support)
- **Clean Card Design**: Modern background with subtle shadows and rounded corners
- **Advanced Status Indicator**: Dot + descriptive text for current state
  - 🔘 Gray: Idle state (准备录音)
  - 🔴 Red pulsing: Recording active (正在录音...)  
  - 🟡 Orange blinking: Paused state (录音已暂停)
  - 💾 Blue: Saving audio files (保存音频中...)
  - 🔄 Blue rotating: Processing states (转录中/OCR处理中/AI处理中/保存中)
- **Four Independent Buttons**: Fixed positions and clear functions
  - 🟢 **Start Button**: Green, "🎤 开始录音" / "▶️ 继续录音"
  - 🟠 **Pause Button**: Orange, "⏸️ 暂停"
  - 🔴 **Stop Button**: Red, "⏹️ 停止"
  - ⚪ **Cancel Button**: Gray, "❌ 取消"
- **Time Display**: Large, monospace font with colon blinking during recording
- **Advanced State Logic**: 7 states with complete transition management
- **Smart Cancel Confirmation**: State-aware dialogs prevent accidental data loss
  - Recording/Paused: "确定要取消录音吗？录音内容将会丢失"
  - Processing: "正在处理录音，确定要取消吗？已录制内容将会丢失"
  - Saving: "正在保存笔记，确定要取消吗？处理完成的内容可能丢失"
- **Wake Lock Indicator**: Shows when screen lock prevention is active
- **Image Upload Area**: Drag-and-drop support with thumbnail preview
- **OCR Progress Display**: Real-time progress tracking for image processing
- **Contextual Hints**: Dynamic help text that changes based on current state
- **Responsive Layout**: Horizontal buttons on desktop, vertical stack on mobile
- **Button Feedback**: Hover effects, disabled states, and press animations

### Enhanced Note Templates (Phase 8)
- **Card-Based Layout**: Clean sections for different content types
- **User Thoughts Section**: Displays original voice transcription
- **AI Analysis Section**: Shows processed content and structured tags
- **Image Gallery**: Embedded images with OCR text overlay options
- **Audio Playback**: Inline audio player for original recordings
- **Structured Metadata**: YAML front matter with comprehensive tags
- **Smart Titles**: AI-generated titles based on content analysis

### Animation System
- **Status Animations**: Dot pulsing for recording, blinking for paused state
- **Button Interactions**: Subtle lift on hover, press feedback on click
- **Time Display**: Colon blinking during active recording
- **Progress Indicators**: Smooth transitions for processing states
- **Accessibility**: Respects `prefers-reduced-motion` setting for reduced animations

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

### Phase 3 Testing (Completed ✅)
- [x] Complex state machine UI implementation
- [x] Advanced animation and transition effects
- [x] Information band and level meter functionality
- [x] Stop confirmation dialog system
- [x] CSS design token architecture

### Phase 4 Testing (Completed ✅) - UI Simplification
- [x] Four-button interface usability testing
- [x] Simplified state management verification
- [x] Semantic color scheme effectiveness
- [x] Mobile responsiveness optimization
- [x] Accessibility compliance validation

### Phase 5 Testing (Completed ✅) - LLM Integration
- [x] LLM text processing functionality
- [x] AI tag generation accuracy
- [x] Dual API testing (speech + text)
- [x] Fallback mechanism reliability
- [x] Settings UI and configuration

### Phase 6 Testing (Completed ✅) - Cancel Confirmation & Style Improvements
- [x] Close button confirmation dialog
- [x] Cancel button functionality
- [x] State-aware confirmation messages
- [x] API cancellation mechanism
- [x] Resource cleanup verification
- [x] Note style modification features implementation
- [x] Recording cancellation infinite loop bug fix
- [x] Stack overflow error resolution in cancel functionality

### Phase 7 Testing (Completed ✅) - Image OCR Functionality
- [x] Image drag-and-drop upload functionality
- [x] Image validation and thumbnail generation
- [x] OCR processing with qwen-vl-ocr-latest model
- [x] Batch image processing with progress tracking
- [x] Error handling and retry mechanisms for image processing
- [x] Combined audio + OCR text processing
- [x] Multimodal note generation with image integration
- [x] Image saving to vault with proper file management
- [x] UI improvements for image handling and preview

### Phase 8 Testing (Completed ✅) - Note Template Optimization
Current branch: `笔记模板修改`
- [x] Card-based note layout implementation
- [x] Enhanced YAML front matter generation
- [x] Intelligent content analysis and title generation
- [x] Improved multimodal content rendering
- [x] Structured tag generation and organization
- [x] Better separation of user thoughts and AI analysis
- [x] Wake Lock API integration and indicator
- [x] Advanced processing state management
- [x] Optimized note templates for different content types
- [x] Enhanced metadata and timing information

### Future Enhancement Ideas
- [ ] Advanced note templates with more multimedia support
- [ ] Batch audio processing capabilities
- [ ] Export/import settings functionality
- [ ] Performance optimization for long recordings
- [ ] Plugin marketplace submission preparation
- [ ] Multi-language OCR support
- [ ] Voice command integration
- [ ] Real-time collaboration features

### Common Issues and Solutions

1. **CORS Errors**: Always use `requestUrl()` instead of `fetch()` for API calls
2. **API Format**: Ensure proper request format for each model type (DashScope vs Compatible mode)
3. **TypeScript Errors**: Update tsconfig.json target to ES2017 for modern methods
4. **Audio Permission**: Handle microphone permission requests gracefully via `AudioRecorder.isSupported()`
5. **File Saving**: Use Obsidian's vault API for proper file creation via `app.vault.create()`
6. **Build Issues**: esbuild config excludes Obsidian APIs - they're provided at runtime
7. **Plugin Loading**: Manual installation to `.obsidian/plugins/getnote-plugin/` directory required for testing
8. **Wake Lock**: Feature detection required as not all browsers support the Wake Lock API
9. **Image Processing**: Large images may require chunking for processing to avoid timeout issues

## Official Resources

- **Developer Documentation**: https://docs.obsidian.md/
- **Sample Plugin**: https://github.com/obsidianmd/obsidian-sample-plugin
- **API Types**: https://github.com/obsidianmd/obsidian-api
- **Plugin Releases**: https://github.com/obsidianmd/obsidian-releases
- **DashScope API**: https://bailian.console.aliyun.com/
- **Official API Reference**: Model documentation for qwen series models
- **Wake Lock API**: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

## Important Notes for Future Development

### Architecture Decisions
- **UI Simplicity**: Current 4-button interface (Start/Pause/Stop/Cancel) is the result of user testing - avoid over-complicating
- **API Integration**: DashScope requires specific `requestUrl()` usage due to Obsidian CORS restrictions
- **Modular Design**: Each component handles distinct responsibilities with clear interfaces
- **Cancellation Support**: All async operations support user cancellation with proper cleanup
- **Template System**: Card-based note layout optimized for multimodal content presentation

### Key Constraints
1. **CORS Limitation**: Cannot use standard `fetch()` - must use Obsidian's `requestUrl()`
2. **Audio Processing**: 10MB limit, Base64 encoding required for API transmission  
3. **State Management**: 7 processing states require careful coordination for cancel operations
4. **LLM Fallback**: Text processing failures must gracefully fall back to raw transcription
5. **Wake Lock**: Feature detection required, not supported in all environments

### Git Branch Strategy
- **main**: Stable production code with completed Phase 8 features
- **笔记模板修改**: Current branch with note template optimization (merged into main)
- Recent completed work: Multimodal functionality, note template improvements, Wake Lock integration

### Development Workflow
1. Features developed in feature branches with clear naming
2. Testing completed within feature branches before main merge
3. Each phase represents a major feature milestone
4. Commit messages use conventional format with emoji prefixes for clarity
5. Regular documentation updates to maintain accuracy