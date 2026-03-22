<?php if (!defined('ABSPATH')) exit;

global $tpl_assets;
$tpl_assets = [
  'css' => 'page-blog',
];

// renderPage('services', get_page_fields('services'));
renderPage('blog');
