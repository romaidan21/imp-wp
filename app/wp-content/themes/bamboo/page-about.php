<?php if (!defined('ABSPATH')) exit;

/**
 * Template Name: About Us
 * Template Post Type: page
 */

global $tpl_assets;
$tpl_assets = [
  'css' => 'page-about',
];

renderPage('about');
