<?php if (!defined('ABSPATH')) exit;

add_action('init', 'createBamooCustomPosts');
add_action('init', 'removeDefaultPostType');
add_action('admin_init', 'remove_fse_on_page_type');

function createBamooCustomPosts()
{
  register_post_type('blog', [
    'labels'        => [
      'name'           => __('Блог', 'bamboo'),
      'all_items'      => __('Усі статті', 'bamboo'),
      'name_admin_bar' => __('Блог', 'bamboo'),
      'singular_name'  => __('Стаття', 'bamboo'),
      'add_new'        => __('Додати статтю', 'bamboo'),
      'add_new_item'   => __('Додати статтю', 'bamboo')
    ],
    'public'        => true,
    'has_archive'   => true,
    'show_in_rest'  => true,
    'menu_position' => 4,
    'menu_icon'     => 'dashicons-welcome-write-blog',
    'supports'      => ['title', 'editor', 'excerpt', 'thumbnail', 'author']
  ]);

  register_taxonomy('blog_category', ['blog'], [
    'labels' => [
      'name' => 'Категорії',
    ],
    'show_admin_column' => true,
    'public'            => true,
    'hierarchical'      => true,
    'show_in_rest'      => true,
    'rewrite' => ['slug' => 'blog/category', 'with_front' => false, 'hierarchical' => false],

  ]);

  register_post_type('services', [
    'labels'        => [
      'name'           => __('Послуги', 'bamboo'),
      'all_items'      => __('Усі послуги', 'bamboo'),
      'name_admin_bar' => __('Послуги', 'bamboo'),
      'singular_name'  => __('Послуга', 'bamboo'),
      'add_new'        => __('Додати послугу', 'bamboo'),
      'add_new_item'   => __('Додати послугу', 'bamboo')
    ],
    'public'        => true,
    'has_archive'   => true,
    'show_in_rest'  => true,
    'menu_position' => 5,
    'menu_icon'     =>  'dashicons-money',
    'supports'      => ['title', 'excerpt', 'thumbnail',  'custom-fields']
  ]);
  // Highlight menu item for custom post type archives
  add_filter('nav_menu_css_class', function ($classes, $item) {
    // Список ваших кастомних типів записів
    $custom_post_types = array('blog', 'services');
    // Якщо це archive сторінка кастомного типу
    if (is_post_type_archive($custom_post_types)) {
      // Отримуємо URL архіву
      $archive_url = get_post_type_archive_link(get_post_type());
      // Якщо пункт меню веде на archive цього типу
      if (isset($item->url) && $item->url === $archive_url) {
        $classes[] = 'current-menu-item';
      }
    }
    return $classes;
  }, 10, 2);
}

/*** Remove Default Post Type ***/
function removeDefaultPostType()
{

  // Remove from Quick Draft
  add_action('wp_dashboard_setup', 'remove_draft_widget', 999);

  function remove_draft_widget()
  {
    remove_meta_box('dashboard_quick_press', 'dashboard', 'side');
  }

  // Remove from +New Post in Admin Bar
  add_action('admin_bar_menu', 'remove_default_post_type_menu_bar', 999);

  function remove_default_post_type_menu_bar($wp_admin_bar)
  {
    $wp_admin_bar->remove_node('new-post');
  }

  // Remove from the Side Menu
  add_action('admin_menu', 'remove_default_post_type');

  function remove_default_post_type()
  {
    remove_menu_page('edit.php');
  }
}

// Remove FSE on page type
function remove_fse_on_page_type()
{
  global $pagenow;
  $post_id = $_GET['post'] ?? '';
  if (empty($post_id)) return;

  $action = $_GET['action'] ?? '';
  $post_type = get_post_type($post_id);

  if ($pagenow == 'post.php' && $action == 'edit' && $post_type == 'page') {
    $template = get_page_template_slug($post_id);

    if ($template != "page-privacy.php") {
      remove_post_type_support('page', 'editor');
    }
  }
}
