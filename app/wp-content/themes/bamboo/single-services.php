<?php if (!defined('ABSPATH')) exit;

global $tpl_assets;

$tpl_assets = [
  'css' => [
    'single-post',
  ],
];

renderPage('single/services');
