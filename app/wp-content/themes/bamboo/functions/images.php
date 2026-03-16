<?php

// Custom images sizes
add_action('after_setup_theme', 'bamboo_add_image_sizes');
function bamboo_add_image_sizes()
{
  if (function_exists('add_image_size')) {

    // Remove auto sizes
    add_filter('wp_img_tag_add_auto_sizes', '__return_false');
    add_filter('wp_img_tag_add_auto_sizes_contain_css', '__return_false');

    // Add image sizes
    // add_image_size('custom', 1040, 960);
  }
}
