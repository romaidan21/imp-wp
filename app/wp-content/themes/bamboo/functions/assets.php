<?php if (!defined('ABSPATH')) exit;

// Config
global $cache;
global $preloaded_assets;
global $use_default_wp_styles;
global $default_styles;
global $cleanup_scripts;
global $cleanup_styles;

$use_default_wp_styles = ['blog', 'news', 'events'];

$cleanup_styles = [
  'contact-form-7',
  'cms-navigation-style-base',
  'cms-navigation-style',
  'wpml-admin-bar',
  'sitepress-style',
  'sitepress-blocks-styles',
  'wpml-tm-admin-bar',
  'wpml-legacy-horizontal-list-0'
];

$cleanup_scripts = [
  'wp-i18n',
  'wp-hooks',
];

$default_styles = [
  'wp-block-library',
  'wp-block-library-theme',
  'classic-theme-styles',
  'wc-blocks-style',
  'wp-block-library-inline',
  'wp-block-library-theme-inline',
];


$preloaded_assets = [
  'css' => ['index'],
  'js' => ['index']
];

/**
 * Get timestamp for cache busting
 *
 * @return int Timestamp for asset versioning
 */
function getTimestamp()
{
  // Use current time for non-production environments
  if (wp_get_environment_type() !== 'production') {
    return (int) microtime(true);
  }

  $timestamp_file = get_template_directory() . '/.timestamp';

  if (!file_exists($timestamp_file)) {
    return (int) microtime(true);
  }

  if (function_exists('file_get_contents')) {
    return (int) file_get_contents($timestamp_file);
  }

  // Fallback for hosting providers that disable file_get_contents
  $handle = fopen($timestamp_file, 'r');
  if ($handle) {
    $timestamp = (int) fread($handle, filesize($timestamp_file));
    fclose($handle);
    return $timestamp;
  }

  return (int) microtime(true);
}

// Cache busting of scripts & styles
$cache = getTimestamp();

/**
 * Load assets based on template configuration
 *
 * @param string|array $tpl Template configuration
 * @param array $deps Dependencies
 * @param string|null $cache Cache version
 */
function loadAssets($tpl, $deps = [], $cache = null)
{
  if (empty($tpl)) return;

  // Initialize CSS and JS files
  $css_files = [];
  $js_files = [];

  // Handle different formats of $tpl
  if (is_string($tpl)) {
    $css_files[] = $tpl;
    $js_files[] = $tpl;
  } elseif (is_array($tpl)) {
    if (!empty($tpl['css'])) {
      $css_files = is_array($tpl['css']) ? $tpl['css'] : [$tpl['css']];
    }
    if (!empty($tpl['js'])) {
      $js_files = is_array($tpl['js']) ? $tpl['js'] : [$tpl['js']];
    }
  }

  // Enqueue CSS files
  foreach ($css_files as $css_file) {
    wp_enqueue_style(
      $css_file,
      getAssets("css/{$css_file}.css"),
      [],
      $cache
    );
  }

  // Enqueue JS files
  foreach ($js_files as $js_file) {
    wp_enqueue_script(
      $js_file,
      getAssets("js/{$js_file}.js"),
      $deps,
      $cache,
      true
    );
  }
}

/**
 * Register and enqueue frontend assets
 */
add_action('wp_enqueue_scripts', function () {
  global $tpl_assets, $cache;

  if (!is_admin()) {
    // Optionally replace jQuery with a newer local version
    wp_deregister_script('jquery');
    // wp_enqueue_script('jquery', get_template_directory_uri() . '/vendor/jquery-3.7.1.min.js', [], '3.7.1', true);
  }

  // Set dependencies
  $deps = wp_script_is('jquery', 'registered') ? ['jquery'] : [];

  // Register global assets
  wp_enqueue_style('index', getAssets("css/index.css"), [], $cache);
  wp_enqueue_script('index', getAssets("js/index.js"), $deps, $cache, true);

  // Set local js vars
  wp_localize_script('index', 'BAMBOO', [
    'baseUrl' => home_url(),
    'ajaxUrl' => admin_url('admin-ajax.php'),
    'themeUrl' => get_template_directory_uri(),
    'assets'  => getAssets()
  ]);

  // Register page-specific assets
  if ($tpl_assets) {
    loadAssets($tpl_assets, array_merge($deps, ['index']), $cache);
  }
});

/**
 * Register admin assets
 */
add_action('admin_enqueue_scripts', function () {
  // Use microtime for non-cached admin assets to ensure fresh loading
  $admin_cache = null;
  // $admin_cache = microtime(true);

  wp_enqueue_style(
    'admin-styles',
    get_stylesheet_directory_uri() . '/admin/css/admin.css',
    [],
    $admin_cache
  );

  wp_enqueue_script(
    'admin-scripts',
    get_stylesheet_directory_uri() . '/admin/js/admin.js',
    ['jquery'],
    $admin_cache,
    true
  );
});

/**
 * Preload assets to improve Lighthouse performance
 *
 */
add_action('wp_head', 'preloadAssets', 1);
function preloadAssets()
{
  global $wp_styles;
  global $wp_scripts;
  global $cache;
  global $preloaded_assets;

  // Preload CSS files
  if (!empty($preloaded_assets['css'])) {
    foreach ($preloaded_assets['css'] as $handle) {
      if (isset($wp_styles->registered[$handle])) {
        $src = $wp_styles->registered[$handle]->src;
        $ver = isset($wp_styles->registered[$handle]->ver) ? $wp_styles->registered[$handle]->ver : $cache;
        $src = add_query_arg('ver', $ver, $src);
        echo '<link rel="preload" href="' . esc_url($src) . '" as="style" onload="this.onload=null;this.rel=\'stylesheet\'">' . "\n";
      }
    }
  }

  // Preload JS files
  if (!empty($preloaded_assets['js'])) {
    foreach ($preloaded_assets['js'] as $handle) {
      if (isset($wp_scripts->registered[$handle])) {
        $src = $wp_scripts->registered[$handle]->src;
        $ver = isset($wp_scripts->registered[$handle]->ver) ? $wp_scripts->registered[$handle]->ver : $cache;
        $src = add_query_arg('ver', $ver, $src);
        echo '<link rel="preload" href="' . esc_url($src) . '" as="script">' . "\n";
      }
    }
  }
}


/**
 * Unified frontend asset optimization
 * Handles removal of unnecessary WordPress styles, scripts, and actions
 */
add_action('init', 'optimize_frontend_assets');
function optimize_frontend_assets()
{
  global $use_default_wp_styles;
  global $default_styles;
  global $cleanup_scripts;
  global $cleanup_styles;

  if (is_admin()) {
    return;
  }

  // Remove duotone SVG filters (can be done early)
  remove_action('wp_body_open', 'wp_global_styles_render_svg_filters');

  // Remove block supports inline styles (can be done early)
  remove_action('wp_enqueue_scripts', 'wp_enqueue_block_style');

  // Hook into wp action (after query is parsed) to conditionally remove global styles actions
  add_action('wp', function () use ($use_default_wp_styles) {
    if (!is_singular() || !in_array(get_post_type(), $use_default_wp_styles)) {
      remove_action('wp_enqueue_scripts', 'wp_enqueue_global_styles');
      remove_action('wp_footer', 'wp_enqueue_global_styles', 1);

      // Only remove common block scripts if Contact Form 7 is not active
      if (!class_exists('WPCF7')) {
        remove_action('wp_enqueue_scripts', 'wp_common_block_scripts_and_styles');
      }
    }
  });

  // Hook into wp_enqueue_scripts to remove styles and scripts
  add_action('wp_enqueue_scripts', function () use (
    $default_styles,
    $cleanup_scripts,
    $use_default_wp_styles,
    $cleanup_styles
  ) {
    // Remove styles that should always be cleaned up (STYLES ONLY)
    foreach ($cleanup_styles as $style_handle) {
      // Only remove if it's actually a registered style, not a script
      if (wp_style_is($style_handle, 'registered')) {
        wp_dequeue_style($style_handle);
        wp_deregister_style($style_handle);
      }
    }

    // Remove cleanup scripts (SCRIPTS ONLY - separate from styles)
    // Skip if Contact Form 7 is active and might need these scripts
    if (!class_exists('WPCF7')) {
      foreach ($cleanup_scripts as $script_handle) {
        wp_dequeue_script($script_handle);
        wp_deregister_script($script_handle);
      }
    }

    // Only apply optimizations on non-single pages or pages not in keep_default_wp_styles array
    if (!is_singular() || !in_array(get_post_type(), $use_default_wp_styles)) {
      // Remove conditional cleanup styles (block-related styles only cleaned up on non-single pages)
      foreach ($default_styles as $style_handle) {
        // Only remove if it's actually a registered style, not a script
        if (wp_style_is($style_handle, 'registered')) {
          wp_dequeue_style($style_handle);
          wp_deregister_style($style_handle);
        }
      }
    }
  }, 100); // Lower priority to run before CF7 scripts are processed
}
