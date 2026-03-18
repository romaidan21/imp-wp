<?php

// Customize theme
add_action('after_setup_theme', 'customizeTheme');
function customizeTheme()
{
  add_theme_support('title-tag');
  add_theme_support('post-thumbnails');
  add_theme_support('custom-logo');
  add_theme_support('html5', [
    'script',
    'style'
  ]);

  // Register menu(s)
  register_nav_menus([
    'header_menu' => 'Header menu',
    'footer_menu' => 'Footer menu',
  ]);

  // Load textdomain
  // load_theme_textdomain('bamboo', get_template_directory() . '/languages');
}

// Custom admin logo
add_action('login_head', function () {

  $logo = get_bloginfo('template_directory') . '/assets/img/logo.svg';

  if (file_exists($logo)) {
    echo '<style>h1 a { background-image:url(' . $logo . ')!important; background-size: contain !important;}</style>';
  }
});

// Add custom css to dashboard
add_action('admin_enqueue_scripts', 'addDashboardStyles');
function addDashboardStyles()
{
  wp_enqueue_style('admin-styles', get_stylesheet_directory_uri() . '/admin.css');
}

// Remove category & tag text before title
// add_filter('get_the_archive_title', function ($title) {
//   return preg_replace('~^[^:]+: ~', '', $title);
// });

// Add contact info to admin
add_action('acf/init', function () {
  acf_add_options_page(array(
    'page_title' => 'Our contacts',
    'menu_title' => 'Our contacts',
    'menu_slug'  => 'contacts-settings',
    'icon_url'   => 'dashicons-email-alt2',
    'position'   => 60,
    'redirect'   => false,
    'autoload'   => true
  ));
});

add_filter('acf/fields/wysiwyg/toolbars', 'wysiwyg_custom_toolbar');
function wysiwyg_custom_toolbar($toolbars)
{
  $toolbars['bamboo_link_bullist'][1] = ['link', 'bullist'];
  $toolbars['bamboo_link'][1] = ['link'];
  $toolbars['bamboo_bullist'][1] = ['bullist'];
  $toolbars['bamboo_sup_sub'][1] = ['superscript', 'subscript'];
  $toolbars['bamboo_bold'][1] = ['bold'];
  return $toolbars;
}

add_filter('acf/format_value/type=wysiwyg', 'disable_wpautop_for_acf_wysiwyg', 100, 3);
function disable_wpautop_for_acf_wysiwyg($value, $post_id, $field)
{
  $toolbar = $field['toolbar'] ?? '';
  if ($toolbar == 'bamboo_link_bullist') {
    $value = strip_tags($value, ['a', 'ul', 'li', 'br']);
  }
  if ($toolbar == 'bamboo_link') {
    $value = strip_tags($value, ['a', 'br']);
  }
  if ($toolbar == 'bamboo_bullist') {
    $value = strip_tags($value, ['ul', 'li', 'br']);
  }
  if ($toolbar == 'bamboo_sup_sub') {
    $value = strip_tags($value, ['sup', 'sub', 'br']);
  }
  if ($toolbar == 'bamboo_bold') {
    $value = strip_tags($value, ['strong', 'b', 'br']);
  }
  return $value;
}
