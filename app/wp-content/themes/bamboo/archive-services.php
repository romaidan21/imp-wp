<?php if (!defined('ABSPATH')) exit;

global $tpl_assets;
$tpl_assets = [
  'css' => 'page-services',
];

renderPage(
  'services',
  [
    'title' => get_the_title(12),
    'subtitle' => get_field('page-description', 12) ?? '',
  ]
);
