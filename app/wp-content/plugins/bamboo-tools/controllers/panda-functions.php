<?php

function panda_render_template($name = '', $args = [])
{
  $full_path = PANDA_PLUG_DIR . "/templates/$name.php";

  if (empty($name) || !file_exists($full_path)) return;
  extract($args);

  include $full_path;
}

function panda_get_header()
{
  panda_render_template('layout/header');
}

function panda_assets_path()
{
  return PANDA_PLUG_DIR_URL . '/assets';
}

function echo_p($text)
{
  echo '<p class="message notice notice-success">' . $text . '</p>';
}

function acf_force_wpml_preferences(&$fields)
{
  if (empty($fields)) return false;

  foreach ($fields as &$field) {
    if (!empty($field['modified'])) {
      $field['modified'] = time();
      $field['acfml_field_group_mode'] = 'advanced';
      if (!empty($field['fields'])) {
        acf_force_wpml_preferences($field['fields']);
        continue;
      }
    } else {
      $field['wpml_cf_preferences'] = 3;
    }

    if (!empty($field['sub_fields']) && is_array($field['sub_fields'])) {
      acf_force_wpml_preferences($field['sub_fields']);
    }

    if ($field['type'] === 'flexible_content' && !empty($field['layouts'])) {
      acf_force_wpml_preferences($field['layouts']);
    }
  }

  return $fields;
}

function acf_copy_once_options_page_fields()
{
  if (!function_exists('acf_get_fields') || !function_exists('icl_get_languages') || !function_exists('get_fields')) {
    return false;
  }

  $languages = apply_filters('wpml_active_languages', null, ['skip_missing' => 0]);
  if (!$languages || count($languages) <= 1) {
    return false;
  }

  $default_lang = apply_filters('wpml_default_language', null);
  $current_lang = apply_filters('wpml_current_language', null);

  do_action('wpml_switch_language', $default_lang);
  $default_options = get_fields('option');

  if (!$default_options || !is_array($default_options)) {
    return false;
  }

  foreach ($languages as $lang_code => $lang) {
    if ($lang_code === $default_lang) continue;

    do_action('wpml_switch_language', $lang_code);

    foreach ($default_options as $key => $value) {
      $up = update_field($key, $value, 'option');
      if(!$up) {
        $dd = '';
      }
    }
  }

  do_action('wpml_switch_language', $current_lang);
  return true;
}
