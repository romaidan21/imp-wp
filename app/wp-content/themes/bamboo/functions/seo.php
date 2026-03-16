<?php

// Disable site indexing for development environments
function preventIndexingTestEnv()
{
    if ('production' !== wp_get_environment_type()) {

        // Using robots.txt method
        add_filter('robots_txt', function ($output, $public) {
            $output = "User-agent: *\n";
            $output .= "Disallow: /\n";
            return $output;
        }, 10, 2);

        // Using noindex meta tag
        add_action('wp_head', function () {
            echo '<meta name="robots" content="noindex, nofollow" />' . "\n";
        });

        // Using WordPress built-in feature
        update_option('blog_public', 0);

        // Using Yoast SEO plugin
        if (defined('WPSEO_VERSION') && class_exists('WPSEO_Options')) {
            WPSEO_Options::set('noindex-subpages-wpseo', true);
        }
    }
}
add_action('init', 'preventIndexingTestEnv');

// Remove author name from shared links
add_filter( 'oembed_response_data', 'disable_embeds_filter_oembed_response_data_' );
function disable_embeds_filter_oembed_response_data_( $data ) {
    unset($data['author_url']);
    unset($data['author_name']);
    return $data;
}

/**
 * Fix the "Undefined array key 'host'" error in canonical.php
 *
 * @param string|bool $redirect_url The redirect URL or false to prevent redirection
 * @param string $requested_url The originally requested URL
 * @return string|bool Modified redirect URL or false to cancel redirection
 */
function fix_canonical_host_error($redirect_url, $requested_url) {
  // If redirect URL is empty or false, just return it (no need to process)
  if (!$redirect_url) {
      return $redirect_url;
  }

  // Parse the URLs into components
  $redirect_parts = parse_url($redirect_url);

  // Check if 'host' key is missing and add it if necessary
  if (!isset($redirect_parts['host']) && isset($_SERVER['HTTP_HOST'])) {
      // Create a properly formatted URL with the host
      $scheme = is_ssl() ? 'https://' : 'http://';
      $redirect_url = $scheme . $_SERVER['HTTP_HOST'] . $redirect_parts['path'];

      // Add query string if it exists
      if (isset($redirect_parts['query'])) {
          $redirect_url .= '?' . $redirect_parts['query'];
      }
  }

  return $redirect_url;
}

// Add the filter with priority 10 and 2 parameters
add_filter('redirect_canonical', 'fix_canonical_host_error', 10, 2);