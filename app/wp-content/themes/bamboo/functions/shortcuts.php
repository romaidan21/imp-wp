<?php if (!defined('ABSPATH')) exit;

use BambooCore\Front\Front as Front;

Front::init();

// Shortcut to assets
function assets($path = '')
{
  echo getAssets($path);
}


function getAssets($path = '')
{
  return get_template_directory_uri() . '/assets/' . $path;
}

// Show custom logo (linked on all pages)
function renderLogo($render = true)
{
  $logo_path = apply_filters('renderLogo', "img/logo");
  $home_url = home_url();
  $blog_title = get_bloginfo('title');

  echo '<a class="main-logo" href="' . esc_url($home_url) . '" ';

  if (is_front_page()) {
    echo 'aria-current="page" ';
  }

  echo 'aria-label="' . esc_attr($blog_title) . '">';
  if ($render) {
    renderSVG($logo_path);
  }
  echo '</a>';
}

// Show short menu version (only a href tags)
function renderShortMenu($loc = null)
{
  if ($loc) {
    $menu = wp_nav_menu([
      'theme_location' => $loc,
      'echo'           => false,
      'fallback_cb'    => null,
      'depth'          => 0
    ]);
    echo strip_tags($menu, '<a>');
  } else {
    echo 'No menu location added';
  }
}

// Convert phone number to link
function phoneToLink($phone)
{
  return 'tel:' . preg_replace('/[^0-9]/', '', $phone);
}

// Convert email to link with antispam protection
function emailToLink($email)
{
  return 'mailto:' . antispambot($email, 1);
}

// Render templates
function renderPage($tpl_name, $data = null, $header = '', $footer = '')
{
  if (function_exists('get_field')) {
    // ACF is available, use get_field function
    $pageContent = get_field('pageContent') ?? get_field('page-content') ?? null;
  } else {
    // ACF is not available, set $pageContent to null
    $pageContent = null;
  }

  // Use the provided $data if it's not null, otherwise use $pageContent
  $finalData = $data ?? $pageContent;

  Front::renderPage($tpl_name, $finalData, $header, $footer);
}

function renderLayout($tpl_name, $data = null)
{
  Front::renderLayout($tpl_name, $data);
}

function renderSection($section_name, $data = null)
{
  Front::renderSection($section_name, $data);
}

function renderComponent($tpl_name, $data = null)
{
  Front::renderComponent($tpl_name, $data);
}

function renderBlock($tpl_name, $data = null)
{
  Front::renderBlock($tpl_name, $data);
}

function loadComponent($tpl_name, $data = null)
{
  ob_start();
  renderComponent($tpl_name, $data);
  $var = ob_get_contents();
  ob_end_clean();
  return $var;
}

function debug_data($data, $exit = true)
{
  echo '<pre>';
  print_r($data);
  echo "</pre>";
  if ($exit) exit;
}

function renderTempImage($name)
{
  if (wp_get_environment_type() !== 'local') {
    $name = preg_replace('/\.png$/i', '.webp', $name);
  }
  echo "<img src= \"" . getAssets("img/temp/" . $name) . "\" alt='Temporary Image' />";
}

function get_page_fields($path = '')
{
  $page = get_page_by_path($path);
  if (!$page) return [];

  $page_id = apply_filters('wpml_object_id', $page->ID ?? '', 'page', TRUE);
  return get_field('pageContent', $page_id);
}
