<?php

namespace BambooCore\Front;

class Front
{
  private static $templates_root;
  private static $current_page;

  public static function init()
  {
    self::$templates_root = get_template_directory() . '/templates/';
  }

  public static function renderPage($page_name, $data = null, $header = '', $footer = '')
  {
    self::$current_page = $page_name;
    $data = $data ?? self::getPageData();

    // Render header
    if ($header !== false) {
      get_header($header);
    }

    // Render the main page content
    self::renderTemplate("$page_name/index", 'pages', $data);

    // Render footer
    if ($footer !== false) {
      get_footer($footer);
    }
  }

  public static function renderLayout($tpl_name, $data = null)
  {
    self::renderTemplate($tpl_name, 'layout', $data);
  }

  public static function renderSection($section_name, $data = null)
  {
    if (str_starts_with($section_name, '>')) {
      // For sections starting with >, look in the shared sections folder
      self::renderTemplate(ltrim($section_name, '>'), 'sections', $data);
    } else {
      // For regular sections, look in the current page's folder
      self::renderTemplate(self::$current_page . "/sections/$section_name", 'pages', $data);
    }
  }

  public static function renderComponent($tpl_name, $data = null)
  {
    self::renderTemplate($tpl_name, 'components', $data);
  }

  public static function renderBlock($tpl_name, $data = null)
  {
    self::renderTemplate($tpl_name, 'blocks', $data);
  }

  private static function renderTemplate($tpl_name, $tpl_type, $data = null)
  {
    try {
      if (!$tpl_name) {
        throw new \Exception("Template name can't be empty");
      }
      if (!$tpl_type) {
        throw new \Exception("Template type can't be empty");
      }

      $template_path = self::$templates_root . $tpl_type . '/' . $tpl_name . '.php';

      if (file_exists($template_path)) {
        get_template_part('templates/' . $tpl_type . '/' . $tpl_name, '', $data);
      } else {
        throw new \Exception("Template does not exist: $template_path");
      }
    } catch (\Exception $e) {
      echo $e->getMessage() . '<br>' . $e->getFile() . ' in ' . $e->getLine();
    }
  }

  private static function getPageData()
  {
    if (function_exists('get_field')) {
      return get_field('page_content') ?? get_field('pageContent') ?? [];
    }
    return [];
  }
}
