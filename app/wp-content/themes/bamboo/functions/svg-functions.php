<?php if (!defined('ABSPATH')) exit;

// Inline SVG from path or WordPress Media Library
function renderSVG($filename, $is_attachment_id = false): void
{
  if ($is_attachment_id) {
    echo getSVGFromMediaLibrary($filename);
  } else {
    echo getSVG($filename);
  }
}

// Save SVG content to variable
function getSVG($filename): string|false
{
  if (!$filename) {
    return false;
  }

  // Build path once and check file existence
  $path = get_template_directory() . '/assets/' . $filename . '.svg';
  $file_exists = file_exists($path);
  $file_time = $file_exists ? filemtime($path) : 0;

  // Try to get from cache first (if caching is enabled)
  if (should_cache_svg()) {
    $cache_key = generate_svg_cache_key($filename, $file_time);

    $svg = get_transient($cache_key);
    if ($svg !== false) {
      return $svg;
    }
  }

  // Try to load from filesystem first (only if file exists)
  $content = '';
  if ($file_exists) {
    $content = getFileContent($path);
  }

  // If file doesn't exist locally, try to fetch from URL
  if (empty($content)) {
    $url = get_template_directory_uri() . '/assets/' . $filename . '.svg';
    $content = getFileFromUrl($url);
  }

  // Compress/optimize the SVG content
  if (!empty($content)) {
    $content = compressSVG($content);
  }

  // Cache the result if we have content and caching is enabled
  if (!empty($content) && should_cache_svg()) {
    $cache_key = generate_svg_cache_key($filename, $file_time);
    set_transient($cache_key, $content, 12 * HOUR_IN_SECONDS);
  }

  return $content ? $content : '';
}

// Get file content
function getFileContent($path = ''): string|false
{
  if (!$path || !is_string($path)) {
    return false;
  }

  try {
    // Check if file exists and is readable
    if (!file_exists($path) || !is_readable($path)) {
      return false;
    }

    // Get file size first to avoid loading huge files
    $filesize = filesize($path);
    if ($filesize === false || $filesize > 1024 * 1024) { // Max 1MB for SVG
      return false;
    }

    // Check available memory to prevent memory exhaustion
    $memory_limit = wp_convert_hr_to_bytes(ini_get('memory_limit'));
    $memory_usage = memory_get_usage(true);
    $available_memory = $memory_limit - $memory_usage;

    // Ensure we have at least 2x the file size available (safety buffer)
    if ($available_memory < ($filesize * 2)) {
      return false;
    }

    $content = file_get_contents($path);
    return $content !== false ? $content : false;
  } catch (\Throwable $th) {
    return false;
  }
}

// Inline SVG from url
function getFileFromUrl($url): string
{
  if (!$url || !is_string($url)) {
    return '';
  }

  try {
    // Parse the URL to check if it's on the current domain
    $parsed_url = parse_url($url);
    $current_domain = parse_url(home_url(), PHP_URL_HOST);

    // If it's on the current domain, try to load from filesystem instead
    if (isset($parsed_url['host']) && $parsed_url['host'] === $current_domain) {
      $local_path = $_SERVER['DOCUMENT_ROOT'] . $parsed_url['path'];

      // Try alternative path if WordPress is in a subdirectory
      if (!file_exists($local_path)) {
        $wp_path = str_replace(home_url(), ABSPATH, $url);
        if (file_exists($wp_path)) {
          $local_path = $wp_path;
        }
      }

      if (file_exists($local_path)) {
        return getFileContent($local_path) ?: '';
      }
    }

    // If not on current domain or file not found locally, fetch via HTTP
    $args = [
      'timeout'         => 5,
      'httpversion'     => '1.0',
      'redirection'     => 1,
      'sslverify'       => false,
      'user-agent'      => 'WordPress/' . get_bloginfo('version'),
    ];

    // Add staging authentication if needed
    if (
      wp_get_environment_type() === 'staging' &&
      isset($_ENV["SSL_USER"]) && isset($_ENV["SSL_PASS"])
    ) {
      $args['headers'] = [
        'Authorization' => 'Basic ' . base64_encode($_ENV["SSL_USER"] . ':' . $_ENV["SSL_PASS"])
      ];
    }

    $response = wp_remote_get($url, $args);

    // Check for errors
    if (is_wp_error($response)) {
      return '';
    }

    $response_code = wp_remote_retrieve_response_code($response);
    if ($response_code !== 200) {
      return '';
    }

    $body = wp_remote_retrieve_body($response);

    // Basic validation for SVG content
    if (!empty($body) && (strpos($body, '<svg') !== false || strpos($body, '<?xml') !== false)) {
      return $body;
    }

    return '';
  } catch (\Throwable $th) {
    return '';
  }
}

// Include admin functionality
add_action('admin_menu', 'svg_cache_admin_menu');
add_action('admin_post_clear_svg_cache', 'handle_svg_cache_clear');
add_action('admin_post_compress_svg_files', 'handle_svg_compression');

// Add admin menu item
function svg_cache_admin_menu()
{
  add_management_page(
    'SVG Tools',
    'SVG Tools',
    'manage_options',
    'svg-cache-management',
    'svg_cache_admin_page'
  );
}

// Admin page content
function svg_cache_admin_page()
{
  // Get cache statistics
  $svg_cache_count = get_svg_cache_count();
  $total_transients = get_total_transients_count();

  // Check if caching is disabled
  $is_local_dev = !should_cache_svg();

?>
  <div class="wrap">
    <h1>SVG Tools</h1>

    <?php if (isset($_GET['message'])): ?>
      <?php
      $message = $_GET['message'];
      $is_error_message = strpos($message, 'Error details:') !== false;
      $is_compression_message = strpos($message, 'SVG compression completed') !== false;
      ?>
      <div class="notice notice-<?php echo $is_error_message ? 'warning' : 'success'; ?> is-dismissible">
        <?php if ($is_error_message): ?>
          <?php
          $parts = explode(' | Error details: ', $message, 2);
          $main_message = $parts[0];
          $error_details = isset($parts[1]) ? explode(' | ', $parts[1]) : [];
          ?>
          <p><strong><?php echo esc_html($main_message); ?></strong></p>
          <?php if (!empty($error_details)): ?>
            <details style="margin-top: 10px;">
              <summary style="cursor: pointer; font-weight: bold;">View Error Details (<?php echo count($error_details); ?> errors)</summary>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <?php foreach ($error_details as $error): ?>
                  <li style="margin: 5px 0; font-family: monospace; font-size: 12px; color: #d63638;">
                    <?php echo esc_html($error); ?>
                  </li>
                <?php endforeach; ?>
              </ul>
              <p style="font-size: 12px; color: #646970;">
                <strong>Note:</strong> Detailed error information has also been logged to the WordPress debug.log file.
              </p>
            </details>
          <?php endif; ?>
        <?php elseif ($is_compression_message): ?>
          <?php
          // Parse compression statistics from message
          preg_match('/Processed: (\d+)/', $message, $processed_match);
          preg_match('/Compressed: (\d+)/', $message, $compressed_match);
          preg_match('/Errors: (\d+)/', $message, $errors_match);
          preg_match('/Total size saved: ([^|]+)/', $message, $size_match);

          $processed = $processed_match[1] ?? 0;
          $compressed = $compressed_match[1] ?? 0;
          $errors = $errors_match[1] ?? 0;
          $size_saved = isset($size_match[1]) ? trim($size_match[1]) : '0 B';
          $skipped = $processed - $compressed - $errors;

          $compression_rate = $processed > 0 ? round(($compressed / $processed) * 100, 1) : 0;
          $error_rate = $processed > 0 ? round(($errors / $processed) * 100, 1) : 0;
          ?>
          <p><strong><?php echo esc_html($message); ?></strong></p>
          <details style="margin-top: 10px;">
            <summary style="cursor: pointer; font-weight: bold;">View Compression Statistics</summary>
            <div style="margin: 15px 0;">
              <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr style="background-color: #f0f0f1;">
                  <th style="padding: 8px 12px; text-align: left; border: 1px solid #c3c4c7;">Metric</th>
                  <th style="padding: 8px 12px; text-align: left; border: 1px solid #c3c4c7;">Count</th>
                  <th style="padding: 8px 12px; text-align: left; border: 1px solid #c3c4c7;">Percentage</th>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7;"><strong>Total SVG Files Processed</strong></td>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7;"><?php echo esc_html($processed); ?></td>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7;">100%</td>
                </tr>
                <tr style="background-color: #f9f9f9;">
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #2271b1;">✓ Successfully Compressed</td>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #2271b1;"><?php echo esc_html($compressed); ?></td>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #2271b1;"><?php echo esc_html($compression_rate); ?>%</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #646970;">⚬ Skipped (No optimization needed)</td>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #646970;"><?php echo esc_html($skipped); ?></td>
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #646970;"><?php echo $processed > 0 ? round(($skipped / $processed) * 100, 1) : 0; ?>%</td>
                </tr>
                <?php if ($errors > 0): ?>
                  <tr style="background-color: #f9f9f9;">
                    <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #d63638;">✗ Errors</td>
                    <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #d63638;"><?php echo esc_html($errors); ?></td>
                    <td style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #d63638;"><?php echo esc_html($error_rate); ?>%</td>
                  </tr>
                <?php endif; ?>
                <tr style="background-color: #e7f3ff;">
                  <td style="padding: 8px 12px; border: 1px solid #c3c4c7;"><strong>Total Size Saved</strong></td>
                  <td colspan="2" style="padding: 8px 12px; border: 1px solid #c3c4c7; color: #2271b1;"><strong><?php echo esc_html($size_saved); ?></strong></td>
                </tr>
              </table>

              <div style="margin-top: 15px; padding: 10px; background-color: #f6f7f7; border-left: 4px solid #72aee6;">
                <h4 style="margin: 0 0 8px 0; color: #1d2327;">Summary</h4>
                <ul style="margin: 0; padding-left: 20px; color: #1d2327;">
                  <?php if ($compressed > 0): ?>
                    <li><strong><?php echo esc_html($compressed); ?> files</strong> were successfully optimized</li>
                  <?php endif; ?>
                  <?php if ($skipped > 0): ?>
                    <li><strong><?php echo esc_html($skipped); ?> files</strong> were skipped (already optimized or no compression possible)</li>
                  <?php endif; ?>
                  <?php if ($errors > 0): ?>
                    <li><strong><?php echo esc_html($errors); ?> files</strong> encountered errors during processing</li>
                  <?php endif; ?>
                  <?php if ($size_saved !== '0 B'): ?>
                    <li>Total storage saved: <strong><?php echo esc_html($size_saved); ?></strong></li>
                  <?php endif; ?>
                </ul>
              </div>

              <p style="font-size: 12px; color: #646970; margin-top: 10px;">
                <strong>Note:</strong> Detailed compression logs are available in the WordPress debug.log file.
              </p>
            </div>
          </details>
        <?php else: ?>
          <p><?php echo esc_html($message); ?></p>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <?php if ($is_local_dev): ?>
      <div class="notice notice-info">
        <p><strong>Development Mode:</strong> SVG caching is currently disabled for local development. Files will be loaded fresh on each request.</p>
      </div>
    <?php endif; ?>

    <div class="svg-dashboard-grid">
      <div class="card">
        <h2>Cache Statistics</h2>
        <table class="widefat">
          <tr>
            <td><strong>Environment:</strong></td>
            <td><?php echo esc_html(wp_get_environment_type()); ?></td>
          </tr>
          <tr>
            <td><strong>Caching Status:</strong></td>
            <td><?php echo $is_local_dev ? '<span style="color: orange;">Disabled (Development)</span>' : '<span style="color: green;">Enabled</span>'; ?></td>
          </tr>
          <tr>
            <td><strong>SVG Cache Entries:</strong></td>
            <td><?php echo esc_html($svg_cache_count); ?></td>
          </tr>
          <tr>
            <td><strong>Total Transients:</strong></td>
            <td><?php echo esc_html($total_transients); ?></td>
          </tr>
        </table>
      </div>

      <div class="card">
        <h2>Cache Actions</h2>

        <form method="post" action="<?php echo admin_url('admin-post.php'); ?>">
          <?php wp_nonce_field('clear_svg_cache_action', 'svg_cache_nonce'); ?>
          <input type="hidden" name="action" value="clear_svg_cache">
          <input type="submit" class="button button-primary" value="Clear SVG Cache"
            onclick="return confirm('Are you sure you want to clear all SVG cache?');">
          <p class="description">This will clear only SVG-related cache entries (getSVG_*).</p>
        </form>
      </div>

      <div class="card">
        <h2>SVG Optimization</h2>

        <form method="post" action="<?php echo admin_url('admin-post.php'); ?>">
          <?php wp_nonce_field('compress_svg_action', 'svg_compress_nonce'); ?>
          <input type="hidden" name="action" value="compress_svg_files">
          <input type="submit" class="button button-secondary" value="Compress All SVG Files"
            onclick="return confirm('Are you sure you want to compress all SVG files in Media Library? This will remove XML declarations, comments, and unnecessary whitespace. Original files will be overwritten!');">
          <p class="description">This will compress all SVG files in the Media Library by removing XML declarations, comments, and unnecessary whitespace. <strong>Warning:</strong> This operation will modify the original files and cannot be undone.</p>
        </form>

        <div style="margin-top: 15px;">
          <h4>Compression Features:</h4>
          <ul>
            <li>Removes XML declaration (&lt;?xml version="1.0" encoding="UTF-8"?&gt;)</li>
            <li>Removes DOCTYPE declarations</li>
            <li>Removes HTML comments</li>
            <li>Trims unnecessary whitespace</li>
            <li>Normalizes attribute quotes</li>
            <li>Reduces file size typically by 10-30%</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <h2>SVG Security Analysis</h2>
        <p>Analyze SVG files to understand why they might be blocked during upload.</p>

        <form method="post" enctype="multipart/form-data" style="margin-bottom: 20px;">
          <input type="file" name="svg_analysis_file" accept=".svg" required>
          <input type="submit" name="analyze_svg" class="button button-secondary" value="Analyze SVG File">
          <p class="description">Upload an SVG file to see detailed security analysis without actually uploading it to the media library.</p>
        </form>

        <?php if (isset($_POST['analyze_svg']) && isset($_FILES['svg_analysis_file'])): ?>
          <?php
          $uploaded_file = $_FILES['svg_analysis_file'];
          if ($uploaded_file['error'] === UPLOAD_ERR_OK && $uploaded_file['type'] === 'image/svg+xml') {
            $svg_content = file_get_contents($uploaded_file['tmp_name']);
            if ($svg_content !== false) {
              $analysis = analyze_svg_security($svg_content, $uploaded_file['name']);

              echo '<div style="border: 1px solid #c3c4c7; padding: 15px; background-color: #f9f9f9; margin-top: 15px;">';
              echo '<h3>Analysis Results for: ' . esc_html($uploaded_file['name']) . '</h3>';

              // File info
              echo '<h4>File Information:</h4>';
              echo '<ul>';
              echo '<li><strong>File Size:</strong> ' . size_format($analysis['file_info']['size']) . '</li>';
              echo '<li><strong>Has XML Declaration:</strong> ' . ($analysis['file_info']['has_xml_declaration'] ? 'Yes' : 'No') . '</li>';
              echo '<li><strong>Has DOCTYPE:</strong> ' . ($analysis['file_info']['has_doctype'] ? 'Yes' : 'No') . '</li>';
              echo '<li><strong>Has Comments:</strong> ' . ($analysis['file_info']['has_comments'] ? 'Yes' : 'No') . '</li>';
              echo '</ul>';

              // Security status
              echo '<h4>Security Status:</h4>';
              if ($analysis['is_safe']) {
                echo '<p style="color: #2271b1;"><strong>✓ File appears to be safe for upload</strong></p>';
              } else {
                echo '<p style="color: #d63638;"><strong>✗ File contains potentially harmful content and will be blocked</strong></p>';
              }

              // Issues
              if (!empty($analysis['issues'])) {
                echo '<h4 style="color: #d63638;">Security Issues Found:</h4>';
                echo '<ul>';
                foreach ($analysis['issues'] as $issue) {
                  echo '<li><strong>' . esc_html(str_replace('_', ' ', ucwords($issue['type']))) . '</strong> (' . $issue['count'] . ' occurrence' . ($issue['count'] > 1 ? 's' : '') . ')';
                  if (!empty($issue['examples'])) {
                    echo '<ul>';
                    foreach ($issue['examples'] as $example) {
                      echo '<li style="font-family: monospace; font-size: 12px; color: #666;">' . esc_html(substr($example, 0, 100)) . (strlen($example) > 100 ? '...' : '') . '</li>';
                    }
                    echo '</ul>';
                  }
                  echo '</li>';
                }
                echo '</ul>';
              }

              // Warnings
              if (!empty($analysis['warnings'])) {
                echo '<h4 style="color: #dba617;">Warnings:</h4>';
                echo '<ul>';
                foreach ($analysis['warnings'] as $warning) {
                  if ($warning['type'] === 'disallowed_elements') {
                    echo '<li><strong>Disallowed Elements Found:</strong> ' . esc_html(implode(', ', $warning['elements'])) . '</li>';
                    echo '<p style="font-size: 12px; color: #646970;">These elements will be removed during sanitization but the file can still be uploaded.</p>';
                  }
                }
                echo '</ul>';
              }

              echo '</div>';
            } else {
              echo '<div style="border: 1px solid #d63638; padding: 15px; background-color: #fcf2f2; margin-top: 15px;">';
              echo '<p style="color: #d63638;"><strong>Error:</strong> Could not read file content.</p>';
              echo '</div>';
            }
          } else {
            echo '<div style="border: 1px solid #d63638; padding: 15px; background-color: #fcf2f2; margin-top: 15px;">';
            echo '<p style="color: #d63638;"><strong>Error:</strong> Please upload a valid SVG file.</p>';
            echo '</div>';
          }
          ?>
        <?php endif; ?>

        <div style="margin-top: 20px;">
          <h4>Common Security Issues:</h4>
          <ul>
            <li><strong>Script tags:</strong> &lt;script&gt; elements that could execute JavaScript</li>
            <li><strong>Event handlers:</strong> Attributes like onclick, onload, onmouseover, etc.</li>
            <li><strong>JavaScript protocols:</strong> javascript: URLs in href or xlink:href attributes</li>
            <li><strong>External content:</strong> iframe, object, embed tags that could load external content</li>
            <li><strong>Form elements:</strong> &lt;form&gt; tags that could submit data</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <h2>Cache Information</h2>
        <p><strong>SVG Cache Duration:</strong> <?php echo $is_local_dev ? 'Disabled (Development Mode)' : '12 hours'; ?></p>
        <p><strong>Cache Key Pattern:</strong> getSVG_[md5_hash]</p>
        <p><strong>Storage:</strong> WordPress transients (database or object cache)</p>

        <h3>Cache Behavior:</h3>
        <ul>
          <li><strong>Production/Staging:</strong> SVG files are cached for 12 hours</li>
          <li><strong>Local Development:</strong> No caching - files loaded fresh each time</li>
          <li><strong>Debug Mode:</strong> Caching disabled when WP_DEBUG is true</li>
          <li><strong>Auto-Invalidation:</strong> Cache automatically clears when SVG files are modified</li>
          <li><strong>Memory Safety:</strong> Files larger than 1MB or insufficient memory are rejected</li>
        </ul>

        <h3>When to Clear Cache:</h3>
        <ul>
          <li>After updating SVG files in production</li>
          <li>When SVG files are not displaying correctly</li>
          <li>When switching between environments</li>
          <?php if (!$is_local_dev): ?>
            <li>During testing of SVG changes</li>
          <?php endif; ?>
        </ul>
      </div>
    </div> <!-- Close svg-dashboard-grid -->
  </div>

  <style>
    .svg-dashboard-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin-top: 20px;
    }

    @media (min-width: 1200px) {
      .svg-dashboard-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    .card {
      background: #fff;
      border: 1px solid #ccd0d4;
      padding: 20px;
      border-radius: 4px;
      box-shadow: 0 1px 1px rgba(0, 0, 0, .04);
    }

    .card h2 {
      margin-top: 0;
    }

    .card table {
      margin-top: 15px;
    }

    .card table td {
      padding: 8px 12px;
    }

    .card table tr:nth-child(even) {
      background-color: #f9f9f9;
    }
  </style>
<?php
}

// Handle SVG cache clearing
function handle_svg_cache_clear()
{
  if (!current_user_can('manage_options')) {
    wp_die('Unauthorized access');
  }

  if (!wp_verify_nonce($_POST['svg_cache_nonce'], 'clear_svg_cache_action')) {
    wp_die('Security check failed');
  }

  $cleared = clear_svg_cache();

  $message = $cleared > 0
    ? "Successfully cleared {$cleared} SVG cache entries."
    : "No SVG cache entries found to clear.";

  wp_redirect(admin_url('tools.php?page=svg-cache-management&message=' . urlencode($message)));
  exit;
}

// Handle SVG compression
function handle_svg_compression()
{
  if (!current_user_can('manage_options')) {
    wp_die('Unauthorized access');
  }

  if (!wp_verify_nonce($_POST['svg_compress_nonce'], 'compress_svg_action')) {
    wp_die('Security check failed');
  }

  $result = compress_all_svg_files();

  $message = "SVG compression completed. " .
    "Processed: {$result['processed']}, " .
    "Compressed: {$result['compressed']}, " .
    "Errors: {$result['errors']}, " .
    "Total size saved: " . size_format($result['size_saved']);

  // Add error details if there are any
  if ($result['errors'] > 0 && !empty($result['error_details'])) {
    $message .= " | Error details: " . implode(' | ', $result['error_details']);
  }

  wp_redirect(admin_url('tools.php?page=svg-cache-management&message=' . urlencode($message)));
  exit;
}

// Compress all SVG files in Media Library
function compress_all_svg_files(): array
{
  global $wpdb;

  $results = [
    'processed' => 0,
    'compressed' => 0,
    'errors' => 0,
    'size_saved' => 0,
    'error_details' => []
  ];

  // Get all SVG attachments
  $svg_attachments = $wpdb->get_results(
    "SELECT ID, post_mime_type FROM {$wpdb->posts}
     WHERE post_type = 'attachment'
     AND post_mime_type = 'image/svg+xml'
     AND post_status = 'inherit'"
  );

  foreach ($svg_attachments as $attachment) {
    $results['processed']++;

    $file_path = get_attached_file($attachment->ID);
    $attachment_title = get_the_title($attachment->ID) ?: "Attachment #{$attachment->ID}";

    if (!$file_path || !file_exists($file_path)) {
      $results['errors']++;
      $error_msg = "SVG Compression Error - {$attachment_title}: File not found or invalid path: " . ($file_path ?: 'No file path');
      $results['error_details'][] = $error_msg;
      error_log($error_msg);
      continue;
    }

    try {
      // Get original content
      $original_content = file_get_contents($file_path);
      if ($original_content === false) {
        $results['errors']++;
        $error_msg = "SVG Compression Error - {$attachment_title}: Failed to read file content from: {$file_path}";
        $results['error_details'][] = $error_msg;
        error_log($error_msg);
        continue;
      }

      $original_size = strlen($original_content);

      // Compress the SVG
      $compressed_content = compressSVG($original_content);

      if (!$compressed_content || $compressed_content === $original_content) {
        // Log this as info, not an error since it's normal for some SVGs
        error_log("SVG Compression Info - {$attachment_title}: No compression applied (already optimized or failed compression)");
        continue; // No compression needed or failed
      }

      $compressed_size = strlen($compressed_content);

      // Only save if we actually reduced the size
      if ($compressed_size < $original_size) {
        if (file_put_contents($file_path, $compressed_content) !== false) {
          $results['compressed']++;
          $size_saved = $original_size - $compressed_size;
          $results['size_saved'] += $size_saved;

          // Log successful compression
          error_log("SVG Compression Success - {$attachment_title}: Saved {$size_saved} bytes ({$original_size} -> {$compressed_size})");

          // Clear any existing cache for this file
          clear_svg_cache_for_attachment($attachment->ID);
        } else {
          $results['errors']++;
          $error_msg = "SVG Compression Error - {$attachment_title}: Failed to write compressed content to file: {$file_path}";
          $results['error_details'][] = $error_msg;
          error_log($error_msg);
        }
      }
    } catch (\Throwable $th) {
      $results['errors']++;
      $error_msg = "SVG Compression Error - {$attachment_title}: Exception occurred - " . $th->getMessage() . " in " . $th->getFile() . " on line " . $th->getLine();
      $results['error_details'][] = $error_msg;
      error_log($error_msg);
    }
  }

  // Log summary
  error_log("SVG Compression Summary: Processed {$results['processed']}, Compressed {$results['compressed']}, Errors {$results['errors']}, Size saved: " . size_format($results['size_saved']));

  return $results;
}

// Clear cache entries for specific attachment
function clear_svg_cache_for_attachment($attachment_id): void
{
  global $wpdb;

  $wpdb->query(
    $wpdb->prepare(
      "DELETE FROM {$wpdb->options}
       WHERE option_name LIKE %s
       OR option_name LIKE %s",
      '_transient_getSVG_media_' . md5($attachment_id . '_%'),
      '_transient_timeout_getSVG_media_' . md5($attachment_id . '_%')
    )
  );
}

// Clear only SVG cache entries
function clear_svg_cache(): int
{
  global $wpdb;

  // Clear SVG transients from database (including new cache keys with timestamps)
  $deleted = $wpdb->query(
    "DELETE FROM {$wpdb->options}
     WHERE option_name LIKE '_transient_getSVG_%'
     OR option_name LIKE '_transient_timeout_getSVG_%'"
  );

  // If using object cache, try to clear SVG entries
  if (function_exists('wp_cache_delete')) {
    // We can't easily iterate through object cache, so flush all
    // This is a limitation of most object cache implementations
    wp_cache_flush();
  }

  return $deleted;
}

// Get count of SVG cache entries
function get_svg_cache_count(): int
{
  global $wpdb;

  $count = $wpdb->get_var(
    "SELECT COUNT(*) FROM {$wpdb->options}
     WHERE option_name LIKE '_transient_getSVG_%'"
  );

  return (int) $count;
}

// Get total transients count
function get_total_transients_count(): int
{
  global $wpdb;

  $count = $wpdb->get_var(
    "SELECT COUNT(*) FROM {$wpdb->options}
     WHERE option_name LIKE '_transient_%'
     AND option_name NOT LIKE '_transient_timeout_%'"
  );

  return (int) $count;
}

// SVG Upload Support - Replace SVG Support plugin functionality
add_filter('upload_mimes', 'add_svg_upload_support');
add_filter('wp_check_filetype_and_ext', 'fix_svg_mime_type', 10, 5);
add_action('admin_head', 'fix_svg_admin_display');
add_filter('wp_prepare_attachment_for_js', 'fix_svg_media_library_display', 10, 3);
add_filter('wp_handle_upload_prefilter', 'sanitize_svg_upload');
add_action('add_attachment', 'auto_compress_uploaded_svg');

// Allow SVG uploads
function add_svg_upload_support($mimes)
{
  $mimes['svg'] = 'image/svg+xml';
  return $mimes;
}

// Fix SVG MIME type detection
function fix_svg_mime_type($data, $file, $filename, $mimes, $real_mime = null)
{
  $wp_file_type = wp_check_filetype($filename, $mimes);

  if (isset($wp_file_type['ext']) && $wp_file_type['ext'] === 'svg') {
    $data['ext'] = 'svg';
    $data['type'] = 'image/svg+xml';
  }

  return $data;
}

// Fix SVG display in admin/Media Library
function fix_svg_admin_display()
{
  echo '<style>
    .attachment-266x266, .thumbnail img {
      width: 100% !important;
      height: auto !important;
    }

    .attachment-preview .thumbnail .centered img[src$=".svg"] {
      width: 100%;
      height: auto;
      position: relative;
    }
  </style>';
}

// Fix SVG display in Media Library grid/list view
function fix_svg_media_library_display($response, $attachment, $meta)
{
  if ($response['mime'] === 'image/svg+xml') {
    $response['image'] = [
      'src' => $response['url'],
      'width' => 200,
      'height' => 200,
    ];
    $response['thumb'] = [
      'src' => $response['url'],
      'width' => 150,
      'height' => 150,
    ];
    $response['sizes'] = [
      'full' => [
        'url' => $response['url'],
        'width' => 200,
        'height' => 200,
        'orientation' => 'landscape'
      ]
    ];
  }
  return $response;
}

// Sanitize SVG uploads for security
function sanitize_svg_upload($file)
{
  if ($file['type'] === 'image/svg+xml') {
    $svg_content = file_get_contents($file['tmp_name']);

    if ($svg_content !== false) {
      $sanitized_result = sanitize_svg_content($svg_content, $file['name']);

      if ($sanitized_result['sanitized'] !== false) {
        file_put_contents($file['tmp_name'], $sanitized_result['sanitized']);

        // Log any warnings about removed content
        if (!empty($sanitized_result['warnings'])) {
          log_svg_error('Upload Warning', $file['name'], $sanitized_result['warnings']);
        }
      } else {
        $error_details = !empty($sanitized_result['errors']) ? ' Details: ' . implode(', ', $sanitized_result['errors']) : '';
        $file['error'] = "SVG file contains potentially harmful content and cannot be uploaded.{$error_details}";

        // Log detailed error information
        log_svg_error('Upload Blocked', $file['name'], $sanitized_result['errors']);
      }
    }
  }

  return $file;
}

// Automatically compress SVG files when uploaded
function auto_compress_uploaded_svg($attachment_id): void
{
  $attachment = get_post($attachment_id);
  if (!$attachment || $attachment->post_mime_type !== 'image/svg+xml') {
    return;
  }

  $file_path = get_attached_file($attachment_id);
  if (!$file_path || !file_exists($file_path)) {
    return;
  }

  try {
    $original_content = file_get_contents($file_path);
    if ($original_content === false) {
      return;
    }

    $compressed_content = compressSVG($original_content);

    // Only save if compression actually reduced the size
    if ($compressed_content && strlen($compressed_content) < strlen($original_content)) {
      file_put_contents($file_path, $compressed_content);
    }
  } catch (\Throwable $th) {
    // Fail silently, don't break the upload process
  }
}

// Get allowed SVG elements for security validation
function get_allowed_svg_elements(): array
{
  return [
    // Structure and grouping
    'svg',
    'g',
    'defs',
    'use',
    'symbol',
    'switch',
    // Basic shapes
    'path',
    'circle',
    'ellipse',
    'rect',
    'line',
    'polyline',
    'polygon',
    // Text elements
    'text',
    'tspan',
    'textPath',
    'altGlyph',
    'altGlyphDef',
    'altGlyphItem',
    'glyph',
    'glyphRef',
    // Paint servers and gradients
    'linearGradient',
    'radialGradient',
    'stop',
    'pattern',
    // Clipping and masking
    'clipPath',
    'mask',
    // Filters (commonly used and safe)
    'filter',
    'feGaussianBlur',
    'feColorMatrix',
    'feOffset',
    'feBlend',
    'feFlood',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDistantLight',
    'feDropShadow',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feImage',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feTile',
    'feTurbulence',
    'feComponentTransfer',
    // Animation elements
    'animate',
    'animateTransform',
    'animateMotion',
    'animateColor',
    'set',
    // Other elements
    'image',
    'marker',
    'cursor',
    // Font elements (for icon fonts and custom fonts)
    'font',
    'font-face',
    'font-face-format',
    'font-face-name',
    'font-face-src',
    'font-face-uri',
    // Metadata and styling
    'title',
    'desc',
    'metadata',
    'style'
  ];
}

// Centralized cache configuration check
function should_cache_svg(): bool
{
  static $cache_enabled = null;

  if ($cache_enabled === null) {
    $cache_enabled = !(
      wp_get_environment_type() === 'local' ||
      wp_get_environment_type() === 'development' ||
      (defined('WP_DEBUG') && WP_DEBUG === true) ||
      ($_SERVER['HTTP_PRAGMA'] ?? '') === 'no-cache' ||
      ($_SERVER['HTTP_CACHE_CONTROL'] ?? '') === 'no-cache'
    );
  }

  return $cache_enabled;
}

// Centralized cache key generation
function generate_svg_cache_key(string $identifier, int $file_time = 0): string
{
  return 'getSVG_' . md5($identifier . '_' . $file_time);
}

// Centralized SVG error logging
function log_svg_error(string $context, string $message, array $extra_data = []): void
{
  $log_message = "SVG {$context}: {$message}";
  if (!empty($extra_data)) {
    $log_message .= ' | ' . implode(' | ', array_map(
      fn($key, $value) => "{$key}: {$value}",
      array_keys($extra_data),
      $extra_data
    ));
  }
  error_log($log_message);
}

// SVG Content Sanitization
function sanitize_svg_content($svg_content, $filename = ''): array
{
  $result = [
    'sanitized' => false,
    'errors' => [],
    'warnings' => []
  ];

  // Basic security checks - remove potentially harmful elements and attributes
  $dangerous_patterns = [
    'script_tags' => '/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/mi',
    'iframe_tags' => '/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/mi',
    'object_tags' => '/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/mi',
    'embed_tags' => '/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/mi',
    'form_tags' => '/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/mi',
    'javascript_protocol' => '/javascript:/i',
    'event_handlers' => '/(?:^|\s)on\w+\s*=/i', // Remove event handlers like onclick, onload, etc. (at start or after whitespace)
    'javascript_href' => '/href\s*=\s*["\']javascript:/i',
    'javascript_xlink' => '/xlink:href\s*=\s*["\']javascript:/i',
  ];

  // Check for dangerous patterns
  foreach ($dangerous_patterns as $pattern_name => $pattern) {
    if (preg_match($pattern, $svg_content, $matches)) {
      switch ($pattern_name) {
        case 'script_tags':
          $result['errors'][] = "Contains <script> tags: " . substr($matches[0], 0, 100) . (strlen($matches[0]) > 100 ? '...' : '');
          break;
        case 'iframe_tags':
          $result['errors'][] = "Contains <iframe> tags: " . substr($matches[0], 0, 100) . (strlen($matches[0]) > 100 ? '...' : '');
          break;
        case 'object_tags':
          $result['errors'][] = "Contains <object> tags: " . substr($matches[0], 0, 100) . (strlen($matches[0]) > 100 ? '...' : '');
          break;
        case 'embed_tags':
          $result['errors'][] = "Contains <embed> tags: " . substr($matches[0], 0, 100) . (strlen($matches[0]) > 100 ? '...' : '');
          break;
        case 'form_tags':
          $result['errors'][] = "Contains <form> tags: " . substr($matches[0], 0, 100) . (strlen($matches[0]) > 100 ? '...' : '');
          break;
        case 'javascript_protocol':
          $result['errors'][] = "Contains javascript: protocol references";
          break;
        case 'event_handlers':
          $result['errors'][] = "Contains event handler attributes: " . substr($matches[0], 0, 50) . (strlen($matches[0]) > 50 ? '...' : '');
          break;
        case 'javascript_href':
          $result['errors'][] = "Contains javascript: in href attributes";
          break;
        case 'javascript_xlink':
          $result['errors'][] = "Contains javascript: in xlink:href attributes";
          break;
      }
    }
  }

  // If we found dangerous content, reject the file
  if (!empty($result['errors'])) {
    return $result;
  }

  // Additional security: only allow specific SVG elements
  $allowed_elements = get_allowed_svg_elements();

  // Load SVG as DOMDocument for proper parsing
  $dom = new DOMDocument();
  $dom->preserveWhiteSpace = false;
  $dom->formatOutput = false;

  // Suppress warnings for malformed XML
  libxml_use_internal_errors(true);

  if (!$dom->loadXML($svg_content)) {
    $result['errors'][] = "Invalid XML structure - file appears to be corrupted or malformed";
    libxml_clear_errors();
    return $result;
  }

  libxml_clear_errors();

  // Get all elements
  $xpath = new DOMXPath($dom);
  $all_elements = $xpath->query('//*');

  $removed_elements = [];
  $removed_attributes = [];

  foreach ($all_elements as $element) {
    // Ensure we're working with a DOMElement
    if (!($element instanceof DOMElement)) {
      continue;
    }

    // Check if element is allowed
    if (!in_array(strtolower($element->nodeName), $allowed_elements)) {
      $removed_elements[] = $element->nodeName;
      if ($element->parentNode) {
        $element->parentNode->removeChild($element);
      }
      continue;
    }

    // Remove dangerous attributes
    $attributes_to_remove = [];
    foreach ($element->attributes as $attr) {
      $attr_name = strtolower($attr->name);

      // Remove event handlers and dangerous attributes
      if (
        preg_match('/^on/i', $attr_name) ||
        (in_array($attr_name, ['href', 'xlink:href']) &&
          preg_match('/javascript:/i', $attr->value))
      ) {
        $attributes_to_remove[] = $attr->name;
        $removed_attributes[] = $attr->name . '="' . substr($attr->value, 0, 50) . (strlen($attr->value) > 50 ? '...' : '') . '"';
      }
    }

    foreach ($attributes_to_remove as $attr_name) {
      $element->removeAttribute($attr_name);
    }
  }

  // Add warnings for removed content
  if (!empty($removed_elements)) {
    $unique_elements = array_unique($removed_elements);
    $result['warnings'][] = "Removed disallowed elements: " . implode(', ', $unique_elements);
  }

  if (!empty($removed_attributes)) {
    $result['warnings'][] = "Removed dangerous attributes: " . implode(', ', array_unique($removed_attributes));
  }

  $result['sanitized'] = $dom->saveXML();
  return $result;
}

// Compress and optimize SVG content
function compressSVG($svg_content): string
{
  if (!$svg_content) {
    return '';
  }

  try {
    // Store original content for comparison
    $original_content = $svg_content;

    // Quick check if content is already compressed (no XML declaration, no comments, minimal whitespace)
    if (
      strpos($svg_content, '<?xml') === false &&
      strpos($svg_content, '<!--') === false &&
      !preg_match('/>\s{2,}</', $svg_content)
    ) {
      return $svg_content; // Already optimized
    }

    // Combine multiple regex operations for better performance
    $svg_content = preg_replace([
      '/<\?xml[^>]*\?>\s*/',           // Remove XML declaration
      '/<!DOCTYPE[^>]*>\s*/',          // Remove DOCTYPE declaration
      '/<!--.*?-->/s',                 // Remove comments
      '/>\s+</',                       // Remove whitespace between tags
      '/^\s*$/m',                      // Remove empty lines
      '/\s+/',                         // Remove multiple consecutive spaces
      '/\s*=\s*/',                     // Remove whitespace around =
      '/\s+\/>/',                      // Remove spaces before self-closing tags
      '/\s+>/',                        // Remove spaces before closing >
      "/='([^']*)'/",                  // Normalize quotes to double quotes
    ], [
      '',
      '',
      '',
      '><',
      '',
      ' ',
      '=',
      '/>',
      '>',
      '="$1"',
    ], $svg_content);

    // Remove leading and trailing whitespace
    $svg_content = trim($svg_content);

    // Basic validation - ensure we still have a valid SVG
    if (strpos($svg_content, '<svg') === false) {
      error_log("SVG Compression Warning: Result doesn't contain <svg> tag, returning original content");
      return $original_content;
    }

    return $svg_content;
  } catch (\Throwable $th) {
    error_log("SVG Compression Error in compressSVG(): " . $th->getMessage() . " in " . $th->getFile() . " on line " . $th->getLine());
    return $svg_content; // Return original content if compression fails
  }
}

// Helper function to get SVG from Media Library with caching and compression
function getSVGFromMediaLibrary($attachment_id): string
{
  if (!$attachment_id) {
    return '';
  }

  // Get file path and info once
  $file_path = get_attached_file($attachment_id);
  $file_time = $file_path && file_exists($file_path) ? filemtime($file_path) : 0;

  // Try to get from cache first (if caching is enabled)
  if (should_cache_svg() && $file_time > 0) {
    $cache_key = generate_svg_cache_key('media_' . $attachment_id, $file_time);

    $svg = get_transient($cache_key);
    if ($svg !== false) {
      return $svg;
    }
  }

  $attachment = get_post($attachment_id);
  if (!$attachment || $attachment->post_mime_type !== 'image/svg+xml') {
    return '';
  }

  if (!$file_path || !file_exists($file_path)) {
    return '';
  }

  $content = getFileContent($file_path);
  if (!$content) {
    return '';
  }

  // Compress/optimize the SVG content
  $content = compressSVG($content);

  // Cache the result if we have content and caching is enabled
  if (!empty($content) && should_cache_svg() && $file_time > 0) {
    $cache_key = generate_svg_cache_key('media_' . $attachment_id, $file_time);
    set_transient($cache_key, $content, 12 * HOUR_IN_SECONDS);
  }

  return $content;
}

// Render SVG from Media Library
function renderSVGFromMediaLibrary($attachment_id): void
{
  echo getSVGFromMediaLibrary($attachment_id);
}

// Helper function to analyze SVG content for security issues (for debugging)
function analyze_svg_security($svg_content, $filename = ''): array
{
  $analysis = [
    'is_safe' => true,
    'issues' => [],
    'warnings' => [],
    'file_info' => [
      'size' => strlen($svg_content),
      'has_xml_declaration' => strpos($svg_content, '<?xml') !== false,
      'has_doctype' => strpos($svg_content, '<!DOCTYPE') !== false,
      'has_comments' => strpos($svg_content, '<!--') !== false,
    ]
  ];

  // Check for dangerous patterns
  $dangerous_patterns = [
    'script_tags' => '/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/mi',
    'iframe_tags' => '/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/mi',
    'object_tags' => '/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/mi',
    'embed_tags' => '/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/mi',
    'form_tags' => '/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/mi',
    'javascript_protocol' => '/javascript:/i',
    'event_handlers' => '/(?:^|\s)on\w+\s*=/i',
    'javascript_href' => '/href\s*=\s*["\']javascript:/i',
    'javascript_xlink' => '/xlink:href\s*=\s*["\']javascript:/i',
  ];

  foreach ($dangerous_patterns as $pattern_name => $pattern) {
    if (preg_match_all($pattern, $svg_content, $matches)) {
      $analysis['is_safe'] = false;
      $analysis['issues'][] = [
        'type' => $pattern_name,
        'count' => count($matches[0]),
        'examples' => array_slice($matches[0], 0, 3) // Show first 3 matches
      ];
    }
  }

  // Check for disallowed elements
  $allowed_elements = get_allowed_svg_elements();

  // Extract all element names
  if (preg_match_all('/<(\w+)(?:\s|>)/', $svg_content, $element_matches)) {
    $found_elements = array_unique($element_matches[1]);
    $disallowed_elements = array_diff($found_elements, $allowed_elements);

    if (!empty($disallowed_elements)) {
      $analysis['warnings'][] = [
        'type' => 'disallowed_elements',
        'elements' => $disallowed_elements
      ];
    }
  }

  return $analysis;
}
