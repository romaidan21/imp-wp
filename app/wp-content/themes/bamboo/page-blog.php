<?php if (!defined('ABSPATH')) exit;

/**
 * Template Name: Blog
 * Template Post Type: page
 */

global $tpl_assets;
$tpl_assets = [
  'css' => 'page-blog',
];

renderPage('blog');
