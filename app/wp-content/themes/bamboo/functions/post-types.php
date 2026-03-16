<?php if ( !defined( 'ABSPATH' ) ) exit;

// add_action('init', 'createBamooCustomPosts');
// add_action('init', 'removeDefaultPostType');
// add_action('admin_init', 'remove_fse_on_page_type');

function createBamooCustomPosts()
{
    register_post_type('articles', [
        'labels'        => [
            'name'           => __('Articles', 'bamboo'),
            'all_items'      => __('All articles', 'bamboo'),
            'name_admin_bar' => __('Articles', 'bamboo'),
            'singular_name'  => __('Article', 'bamboo'),
            'add_new'        => __('Add article', 'bamboo'),
            'add_new_item'   => __('Add article', 'bamboo')
        ],
        'public'        => true,
        'has_archive'   => true,
        'show_in_rest'  => true,
        'menu_position' => 4,
        'menu_icon'     => 'dashicons-admin-post',
        'supports'      => ['title', 'editor', 'excerpt', 'thumbnail', 'author']
    ]);

    register_taxonomy('articles_category', ['articles'], [
        'labels' => [
            'name' => 'Categories articles',
        ],
        'publicly_queryable' => false,
        'show_admin_column' => true,
        'public'            => true,
        'hierarchical'      => true,
        'show_in_rest'      => true,
    ]);

    register_taxonomy('articles_tag', ['articles'], [
        'labels' => [
            'name'           => __('Tags articles','bamboo'),
            'all_items'      => __('All Tags', 'bamboo'),
            'name_admin_bar' => __('Tags', 'bamboo'),
            'singular_name'  => __('Tag', 'bamboo'),
            'add_new'        => __('Add Tag', 'bamboo'),
            'add_new_item'   => __('Add Tag', 'bamboo')
        ],
        'publicly_queryable' => false,
        'show_admin_column' => true,
        'public'            => true,
        'hierarchical'      => true,
        'show_in_rest'      => true,
    ]);


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