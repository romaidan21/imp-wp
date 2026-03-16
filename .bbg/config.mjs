import fs from 'fs-extra';

// Load and validate configuration
const cfg = fs.readJSONSync('./config.json');
const REQUIRED_FIELDS = ['siteName', 'themeName', 'url'];

// Validate required configuration fields
const missingFields = REQUIRED_FIELDS.filter(field => !cfg[field]);
if (missingFields.length > 0) {
  throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
}

// Constants
const DIRECTORIES = {
  src: 'src',
  base: 'app',
  backup: '.backup',
  migrations: '.migrations',
  templates: 'templates'
};

const FILE_EXTENSIONS = {
  images: 'png|jpg|jpeg|heif|tiff|webp|avif|gif',
  copyAssets: 'atlas|avi|mp4|ogv|ogg|webm|mov',
  fonts: 'ttf|woff2'
};

const DATABASE_CONFIG = {
  prefix: 'bb_',
  collate: 'utf8mb4_unicode_520_ci',
  charset: 'utf8mb4'
};

// Path builders
const createThemePath = (themeName) => `wp-content/themes/${themeName}`;
const createAssetPath = (base, theme) => `${base}/${theme}/assets`;
const createBuildPath = (assets, type) => `${assets}/${type}/`;

// Generate derived paths
const theme = createThemePath(cfg.themeName);
const assets = createAssetPath(DIRECTORIES.base, theme);

// Source paths configuration
const createSourcePaths = (src, templates, extensions) => ({
  css: `${src}/scss/**/*.scss`,
  js: `${src}/js/**/*.js`,
  img: `${src}/img/**/*.+(${extensions.images})`,
  svg: `${src}/img/**/*.svg`,
  webp: `${src}/**/*.+(atlas)`,
  tpl: `${src}/${templates}/**/*.*`,
  fonts: `${src}/fonts/**/*.+(${extensions.fonts})`,
  json: `${src}/**/*.json`,
  copy: `${src}/**/*.+(${extensions.copyAssets})`
});

// Build paths configuration
const createBuildPaths = (base, theme, assets, templates) => ({
  theme: `${base}/${theme}/`,
  assets,
  css: createBuildPath(assets, 'css'),
  js: createBuildPath(assets, 'js'),
  img: createBuildPath(assets, 'img'),
  fonts: createBuildPath(assets, 'fonts'),
  tpl: `${base}/${theme}/${templates}`
});

// Generate paths
const srcPaths = createSourcePaths(DIRECTORIES.src, DIRECTORIES.templates, FILE_EXTENSIONS);
const buildPaths = createBuildPaths(DIRECTORIES.base, theme, assets, DIRECTORIES.templates);

// Watch paths (exclude _env.scss to prevent loops)
const watchPaths = {
  ...srcPaths,
  css: [`${DIRECTORIES.src}/scss/**/*.scss`, `!${DIRECTORIES.src}/scss/global/_env.scss`]
};

// Export complete configuration
export default {
  ...cfg,
  db: DATABASE_CONFIG,
  images: FILE_EXTENSIONS.images,
  copyAssets: FILE_EXTENSIONS.copyAssets,
  path: {
    base: DIRECTORIES.base,
    srcBase: DIRECTORIES.src,
    theme,
    uploads: 'wp-content/uploads',
    backup: DIRECTORIES.backup,
    migrations: DIRECTORIES.migrations,
    templates: DIRECTORIES.templates,
    src: srcPaths,
    build: buildPaths,
    watch: watchPaths
  }
};

