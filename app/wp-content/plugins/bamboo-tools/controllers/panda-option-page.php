<?php

if (!defined('ABSPATH')) exit;

class OptionPage
{
  public function __construct()
  {
    add_action('admin_menu', array($this, 'customPluginOptionPage'));
  }

  public function customPluginOptionPage()
  {
    add_options_page(
      'Bamboo tools',
      'Bamboo tools',
      'manage_options',
      'bb-tools',
      [$this, 'renderOptionTemplate']
    );
  }

  public function renderOptionTemplate()
  {
    panda_render_template('index');
  }
}

new OptionPage();
