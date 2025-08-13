# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin project named "getnote-plugin". The directory is currently empty and needs to be initialized with the basic Obsidian plugin structure following official Obsidian development requirements.

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
└── styles.css          # Optional plugin styles
```

## Key Dependencies

- `obsidian` - Official Obsidian API types and interfaces
- `typescript` - TypeScript compiler for development
- `esbuild` - Fast build system for compilation
- `@typescript-eslint/eslint-plugin` - Code quality (recommended)

## Official Resources

- Developer Documentation: https://docs.obsidian.md/
- Sample Plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API Types: https://github.com/obsidianmd/obsidian-api
- Plugin Releases: https://github.com/obsidianmd/obsidian-releases