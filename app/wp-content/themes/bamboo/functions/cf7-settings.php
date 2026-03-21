<?php if (!defined('ABSPATH')) exit;

/**
 * Disable the auto-added <p> & <br> tags around inputs in Contact Form 7.
 */
add_filter('wpcf7_autop_or_not', '__return_false');

// Disable CF7 default styles & scripts
add_filter('wpcf7_load_css', '__return_false');
// add_filter( 'wpcf7_load_js', '__return_false' );


/**
 * Custom tags for Contact Form 7.
 */

// Hook the function to wpcf7_init action hook
add_action('wpcf7_init', 'generateCustomCF7tags');

// Replace the default CF7 form attributes with custom ones
add_filter('do_shortcode_tag', 'cf7_form_filter');


function generateCustomCF7tags()
{
  wpcf7_add_form_tag('bb_submit', 'bambooSubmitHandler');
}

function bambooSubmitHandler($tag)
{
  $title = isset($tag->values[0]) ? $tag->values[0] : __('Submit', 'bamboo');

  return loadComponent('button', [
    'class' => 'submit',
    'title' => $title,
    'icon' => 'def',
    'type' => 'submit',
  ]);
}
// Replace the default CF7 form attributes with custom ones
add_filter('do_shortcode_tag', 'cf7_form_filter');
function cf7_form_filter($output)
{
  $output = str_replace('aria-required="true"', 'aria-required="true" required ', $output);
  $output = str_replace('novalidate="novalidate"', ' ', $output);
  return $output;
}

add_filter("shortcode_atts_wpcf7", 'add_aria_label', 10, 3);
function add_aria_label($out, $pairs, $atts)
{
  if (!empty($atts['title']) && is_array($out)) {
    $out['html_title'] = $atts['title'] ?? '';
  }
  return $out;
}
