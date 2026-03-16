<?php if (!defined('ABSPATH')) exit;

/**
 * Template Name: Home
 * Template Post Type: page
 */

global $tpl_assets;
$tpl_assets = [
  'css' => 'page-home',
];

renderPage('home');
