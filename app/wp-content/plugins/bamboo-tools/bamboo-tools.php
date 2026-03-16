<?php

/**
 * Plugin Name:  Bamboo Tools
 * Author:       Panda
 * Description:  Bamboo Tools
 * Version:      1.0.0
 */

define('PANDA_PLUG_DIR', __DIR__);
define('PANDA_PLUG_DIR_URL', plugin_dir_url(__FILE__));

$files_include = [
  'panda-functions.php',
  'steps.php',
  'panda-option-page.php',
  'panda-upgrade.php',
  'panda-ajax.php',
];

foreach ($files_include as $file) {
  if (file_exists(PANDA_PLUG_DIR . '/controllers/' . $file)) {
    require_once(PANDA_PLUG_DIR . '/controllers/' . $file);
  }
}