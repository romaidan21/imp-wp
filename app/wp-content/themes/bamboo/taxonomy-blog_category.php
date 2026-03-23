<?php
global $tpl_assets;
$tpl_assets = [
  'css' => 'page-blog',
];

// renderPage('services', get_page_fields('services'));
renderPage(
  'blog',
  [
    'title' => get_the_title(13),
    'subtitle' => get_field('page-description', 13) ?? '',
  ]
);
