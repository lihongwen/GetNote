# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin project named "getnote-plugin" that creates rich multimodal notes by combining voice recordings and image uploads with AI processing. The plugin uses Alibaba Cloud's DashScope API with multiple models: qwen-audio-asr-latest for audio transcription, qwen-vl-ocr-latest for image OCR, and qwen-plus-latest for content analysis and enhancement.

### Current Status (Phase 7 Complete - Image OCR Functionality ✅)
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

### Key Features
- 🎙️ **Voice Recording**: Uses MediaRecorder API with configurable quality settings
- 🖼️ **Image OCR**: Upload and process images with qwen-vl-ocr-latest for text recognition
- 🔗 **AI Integration**: Alibaba Cloud DashScope API with qwen-audio-asr-latest for precise audio-to-text conversion
- 🎯 **Multimodal Processing**: Combined audio transcription + image OCR with unified LLM analysis
- 📝 **Text Transcription**: Direct audio-to-text conversion without complex prompting
- 🤖 **LLM Text Processing**: Optional AI text optimization using qwen-plus-latest model
- 🏷️ **Auto Tag Generation**: AI-powered content analysis and tag creation
- ⚙️ **Settings UI**: API key management, model selection, output configuration, dual testing
- 📁 **Organization**: Automatic saving to configurable vault folders with enhanced metadata
- 🎯 **Smart Format**: Clean text transcription with AI optimization and structured notes
- 🎨 **Simplified UI**: Four-button interface (Start/Pause/Stop/Cancel) with processing states
- ⏱️ **Clear Status**: Enhanced status indicators for recording/transcribing/processing/saving
- 🌈 **Semantic Colors**: Green=Start, Orange=Pause, Red=Stop, Gray=Cancel for immediate recognition
- 📱 **Responsive Design**: Optimized for both desktop and mobile devices
- ♿ **Accessibility**: Full keyboard navigation and high contrast support
- 🔄 **Robust Processing**: Fallback mechanisms and retry logic for reliable operation
- 🛡️ **Smart Cancellation**: State-aware confirmation dialogs prevent accidental data loss
- 🔚 **Graceful Exit**: Clean resource cleanup and API cancellation on user abort

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

This plugin integrates with **Alibaba Cloud's DashScope API** using two models:

1. **Speech-to-Text**: `qwen-audio-asr-latest`
   - Endpoint: `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
   - Input: Base64 encoded audio (WAV/MP3/M4A/FLAC/OGG, max 10MB)
   - Output: Transcribed text

2. **Text Processing**: `qwen-plus-latest` (optional)
   - Same endpoint, different model parameter
   - Input: Raw transcribed text
   - Output: Optimized text + AI-generated tags

**Critical**: Must use Obsidian's `requestUrl()` instead of `fetch()` to avoid CORS issues.

## Project Structure

```
├── main.ts              # Plugin main class with multimodal processing flow
├── manifest.json        # Plugin metadata (required)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── versions.json        # Version compatibility
├── README.md           # Documentation (required for submission)
├── CLAUDE.md           # Development guidance for Claude Code
├── data.json           # Plugin settings storage
├── src/
│   ├── api-client.ts    # DashScope API integration (speech + OCR + text models)
│   ├── recorder.ts      # Audio recording functionality (with pause/resume)
│   ├── image-manager.ts # Image upload, validation, and thumbnail generation
│   ├── note-generator.ts # Multimodal note creation and vault management
│   ├── settings.ts      # Plugin settings UI (speech + OCR + text testing)
│   ├── recording-modal.ts # Recording control UI with image upload area
│   ├── text-processor.ts # Multimodal LLM processing and optimization
│   └── types.ts         # TypeScript interfaces for multimodal content
└── styles.css          # Complete UI styles including image components
```

## Core Architecture

The plugin follows a **modular architecture** with clear separation of concerns:

```
main.ts                  # Plugin entry point, coordinates multimodal processing
├── src/api-client.ts    # DashScope API integration (audio + OCR + text models)  
├── src/recorder.ts      # Web Audio API recording functionality
├── src/image-manager.ts # Image upload, validation, thumbnail generation, error handling
├── src/recording-modal.ts # UI modal with audio recording + image upload areas
├── src/note-generator.ts # Multimodal note creation with audio + image + OCR sections
├── src/text-processor.ts # Multimodal LLM processing (audio + OCR combined analysis)
├── src/types.ts         # TypeScript interfaces for multimodal content and processing
└── src/settings.ts      # Plugin configuration UI with OCR settings and testing
```

### Key Architectural Patterns

1. **Multimodal API Integration**: `DashScopeClient` handles three models - `qwen-audio-asr-latest` for speech, `qwen-vl-ocr-latest` for OCR, and `qwen-plus-latest` for text processing
2. **State Management**: Recording modal manages 7 states (idle/recording/paused/transcribing/ocr-processing/processing/saving) with intelligent cancellation
3. **Error Handling**: Comprehensive validation, timeout handling, and recovery mechanisms with user-friendly error messages
4. **Image Management**: `ImageManager` provides validation, thumbnail generation, batch processing, and error recovery with detailed reporting
5. **Multimodal Processing**: `TextProcessor` combines audio transcription + OCR text for unified LLM analysis and enhancement
6. **Async Pipeline**: Five-stage processing (audio transcription → image OCR → combined LLM analysis → file saving → note generation)

### Multimodal Data Flow

1. **Audio Recording**: `AudioRecorder` → MediaRecorder blob → base64 encoding → `qwen-audio-asr-latest`
2. **Image Processing**: `ImageManager` → file validation → thumbnail generation → base64 encoding → `qwen-vl-ocr-latest`
3. **Content Combination**: Audio text + OCR text → structured multimodal content object
4. **LLM Enhancement**: Combined content → `qwen-plus-latest` → enhanced text + tags + summary + smart title
5. **Vault Integration**: Images saved to vault → relative paths → multimodal note generation → structured markdown
6. **Cancellation**: `isProcessingCancelled` flag with cleanup at each stage

### Critical Implementation Details

- **CORS Workaround**: All API calls MUST use `requestUrl()` from Obsidian API, never `fetch()`
- **API Interfaces**: Two different request formats - `DashScopeRequest` for audio, `CompatibleRequest` for text
- **Settings Integration**: Plugin settings stored in `data.json`, loaded via `loadData()`/`saveData()`
- **Error Recovery**: TextProcessor failures gracefully fall back to raw transcription
- **Resource Management**: Audio files optionally saved alongside notes when `keepOriginalAudio` enabled

## UI Design Features

### Recording Modal Interface (Phase 6 - With Cancel Confirmation)
- **Clean Card Design**: Simple background with subtle shadows and rounded corners
- **Status Indicator**: Small dot + descriptive text for current state
  - 🔘 Gray: Idle state (准备录音)
  - 🔴 Red pulsing: Recording active (正在录音...)  
  - 🟡 Orange blinking: Paused state (录音已暂停)
  - 🔄 Blue rotating: Processing state (转录中/AI处理中/保存中)
- **Four Independent Buttons**: Fixed positions and clear functions
  - 🟢 **Start Button**: Green, "🎤 开始录音" / "▶️ 继续录音"
  - 🟠 **Pause Button**: Orange, "⏸️ 暂停"
  - 🔴 **Stop Button**: Red, "⏹️ 停止"
  - ⚪ **Cancel Button**: Gray, "❌ 取消"
- **Time Display**: Large, monospace font with colon blinking during recording
- **Enhanced State Logic**: 6 states (idle/recording/paused/transcribing/processing/saving)
- **Smart Cancel Confirmation**: State-aware dialogs prevent accidental data loss
  - Recording/Paused: "确定要取消录音吗？录音内容将会丢失"
  - Processing: "正在处理录音，确定要取消吗？已录制内容将会丢失"
  - Saving: "正在保存笔记，确定要取消吗？处理完成的内容可能丢失"
- **Contextual Hints**: Dynamic help text that changes based on current state
- **Responsive Layout**: Horizontal buttons on desktop, vertical stack on mobile
- **Button Feedback**: Hover effects, disabled states, and press animations

### Animation System
- **Status Animations**: Dot pulsing for recording, blinking for paused state
- **Button Interactions**: Subtle lift on hover, press feedback on click
- **Time Display**: Colon blinking during active recording
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
- [x] Three-button interface usability testing
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

### Phase 7 Testing (In Progress 🚧) - Image Support
Current development branch: `添加图片功能`
- [ ] Image attachment functionality
- [ ] Image processing integration with AI models
- [ ] Visual content analysis features
- [ ] Enhanced note templates with image support
- [ ] UI improvements for image handling

### Future Enhancement Ideas
- [ ] Advanced note templates with multimedia support
- [ ] Batch audio processing
- [ ] Export/import settings functionality
- [ ] Performance optimization for long recordings
- [ ] Plugin marketplace submission
- [ ] Image-to-text OCR integration
- [ ] Voice + visual multimodal AI processing

### Common Issues and Solutions

1. **CORS Errors**: Always use `requestUrl()` instead of `fetch()` for API calls
2. **API Format**: Ensure request includes `input` wrapper around `messages` array for audio API
3. **TypeScript Errors**: Update tsconfig.json target to ES2017 for modern methods
4. **Audio Permission**: Handle microphone permission requests gracefully via `AudioRecorder.isSupported()`
5. **File Saving**: Use Obsidian's vault API for proper file creation via `app.vault.create()`
6. **Build Issues**: esbuild config excludes Obsidian APIs - they're provided at runtime
7. **Plugin Loading**: Manual installation to `.obsidian/plugins/getnote-plugin/` directory required for testing

## Official Resources

- **Developer Documentation**: https://docs.obsidian.md/
- **Sample Plugin**: https://github.com/obsidianmd/obsidian-sample-plugin
- **API Types**: https://github.com/obsidianmd/obsidian-api
- **Plugin Releases**: https://github.com/obsidianmd/obsidian-releases
- **DashScope API**: https://bailian.console.aliyun.com/
- **Official API Reference**: Model qwen-audio-turbo-latest documentation

## Important Notes for Future Development

### Architecture Decisions
- **UI Simplicity**: Current 4-button interface (Start/Pause/Stop/Cancel) is the result of user testing - avoid over-complicating
- **API Integration**: DashScope requires specific `requestUrl()` usage due to Obsidian CORS restrictions
- **Modular Design**: Each component (`recorder`, `api-client`, `note-generator`, etc.) handles distinct responsibilities
- **Cancellation Support**: All async operations must support user cancellation with proper cleanup

### Key Constraints
1. **CORS Limitation**: Cannot use standard `fetch()` - must use Obsidian's `requestUrl()`
2. **Audio Processing**: 10MB limit, Base64 encoding required for API transmission  
3. **State Management**: 6 processing states require careful coordination for cancel operations
4. **LLM Fallback**: Text processing failures must gracefully fall back to raw transcription

### Git Branch Strategy
- **main**: Stable production code with completed features
- **添加图片功能**: Current development branch for image functionality features
- Recent completed work: Note style modification, recording cancellation fixes, UI improvements

### Development Workflow
1. Features developed in feature branches (like `添加图片功能`)
2. Testing completed within feature branches before main merge
3. Each phase represents a major feature milestone
4. Commit messages use conventional format with emoji prefixes