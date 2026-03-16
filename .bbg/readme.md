# BBG (ByeByeGulp)

A custom Vanilla Node.js build system that replaces Gulp, providing better performance and more control over the build process.

## Features

- 🚀 **Fast**: No Gulp overhead, pure Node.js performance
- 🔧 **Customizable**: Easy to extend and modify tasks
- 📦 **Complete**: All original Gulp functionality preserved
- 🎯 **Modern**: Uses latest Node.js features and ES modules
- 👀 **Watch Mode**: Efficient file watching with debouncing
- 🐛 **Debug**: Comprehensive debug logging
- 📊 **Progress**: Real-time task progress and timing

## Installation

BBG is already set up. Just install dependencies:

```bash
yarn install
```

## Usage

### Basic Commands

```bash
# Development mode with watch
yarn start

# Development build (one-time)
yarn dev

# Production build
yarn build
# or
npm run build

# Individual tasks
yarn css
yarn js
node bbg.mjs css
node bbg.mjs js --debug
```

### Available Tasks

#### Main Tasks
- `clean` - Remove built assets
- `css` - Compile SCSS to CSS
- `js` - Bundle JavaScript with Rspack
- `tpl` - Process template files
- `copy` - Copy static assets
- `fonts` - Process font files
- `img` - Process images
- `svg` - Process SVG files
- `json` - Process JSON files
- `webp` - Process WebP atlas files
- `watch` - Watch files for changes

#### Build Tasks (Production)
- `build:css` - Compile CSS for production
- `build:js` - Bundle JS for production
- `build:tpl` - Process templates for production
- `build:fonts` - Process fonts for production
- `build:img` - Process images for production
- `build:svg` - Process SVGs for production
- `build:json` - Process JSON for production
- `build:webp` - Process WebP for production

#### Composite Tasks
- `dev` - Run all development tasks
- `build` - Run all production tasks
- `start` - Run dev tasks + start watching
- `default` - Start watching

### Options

- `--debug` or `-d` - Enable debug logging
- `--help` or `-h` - Show help message

### Examples

```bash
# Run CSS task with debug logging
node bbg.mjs css --debug

# Run production build
node bbg.mjs build

# Start development with watch mode
node bbg.mjs start

# Run individual production CSS task
node bbg.mjs build:css
```

## File Watching

The watch mode uses Node.js `fs.watch()` for efficient file monitoring:

- **Debounced**: Changes are debounced by 300ms to prevent rapid rebuilds
- **Recursive**: Watches subdirectories automatically
- **Filtered**: Ignores `_env.scss` and other temporary files
- **Smart**: Only processes files matching the configured patterns

Watch patterns are configured in `config.json` and map to these directories:
- `css`: `src/scss/**/*.scss`
- `js`: `src/js/**/*.js`
- `img`: `src/img/**/*.+(png|jpg|jpeg|heif|tiff|webp|gif)`
- `svg`: `src/img/**/*.svg`
- `tpl`: `src/templates/**/*.*`
- `fonts`: `src/fonts/**/*.+(ttf|woff2)`
- `json`: `src/**/*.json`
- `copy`: `src/**/*.+(atlas|avi|mp4|ogv|ogg|webm|mov)`
- `webp`: `src/**/*.+(atlas)`

## Configuration

Configuration is handled through:
- `config.json` - Main project configuration
- `bbg/config.mjs` - BBG configuration
- `package.json` - Scripts and dependencies

## Task Structure

Tasks are organized in `bbg/tasks/`:
- Each task is a separate `.mjs` file
- Tasks export async functions
- Environment (development/production) is passed as parameter
- Utilities are shared in `bbg/utils/`

## Differences from Gulp

### Advantages
1. **Performance**: No Gulp overhead, faster startup and execution
2. **Simplicity**: Pure Node.js, easier to understand and debug
3. **Control**: Full control over task execution and flow
4. **Modern**: Uses latest Node.js features
5. **Lightweight**: Fewer dependencies

### Key Changes
1. **No Gulp plugins**: Direct use of libraries (Sass, Lightning CSS, Rspack)
2. **Parallel execution**: Built-in parallel task execution
3. **Better watch**: More efficient file watching
4. **Simpler config**: Easier configuration management
5. **TypeScript-like experience**: Better IDE support with pure JS

## Migration from Gulp

BBG is a drop-in replacement for Gulp:
- All package.json scripts updated
- Same functionality preserved
- Same output structure
- Same configuration files

Old Gulp commands automatically work with new scripts:
```bash
# Old: gulp css
# New: yarn css (or node bbg.mjs css)

# Old: gulp start
# New: yarn start (or node bbg.mjs start)

# Old: gulp build
# New: yarn build (or node bbg.mjs build)
```

## Troubleshooting

### Watch not detecting changes
- Ensure files are in the correct `src/` subdirectories
- Check file patterns in `config.json`
- Try restarting the watch process

### Task fails
- Run with `--debug` flag for detailed logging
- Check the `debug.log` file for error details
- Ensure all dependencies are installed

### Performance issues
- Use production build for final output: `yarn build`
- Debug mode adds overhead - disable for normal use
- Clear node_modules and reinstall if issues persist

## Development

To extend BBG:
1. Add new tasks in `bbg/tasks/`
2. Import and register in `bbg.mjs`
3. Add to composite tasks if needed
4. Update this README

BBG is designed to be easily extensible and maintainable.
