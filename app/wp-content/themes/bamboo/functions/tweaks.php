<?php

//------------------------------------------- Admin tweaks

// Hide ACF from menu
// add_filter('acf/settings/show_admin', '__return_false');

// Dashboards tweaks
if (is_admin()) {

    // Disable Aggressive Updates for core, plugins and themes
    remove_action('admin_init', '_maybe_update_core');
    remove_action('admin_init', '_maybe_update_plugins');
    remove_action('admin_init', '_maybe_update_themes');

    remove_action('load-plugins.php', 'wp_update_plugins');
    remove_action('load-themes.php', 'wp_update_themes');

    // Disable browser check
    add_filter('pre_site_transient_browser_' . md5($_SERVER['HTTP_USER_AGENT']), '__return_empty_array');

    // Remove thank you WP in admin
    add_action("admin_init", function () {
        add_filter("admin_footer_text", function () {
            return null;
        }, 11);
    });

    // Hide WP version in Admin footer
    add_action('admin_menu', function () {
        remove_filter('update_footer', 'core_update_footer');
    });

    // Remove Quick Draft Dashboard Widget
    add_action('wp_dashboard_setup', function () {
        remove_meta_box('dashboard_quick_press', 'dashboard', 'side');
    }, 999);

    // Remove WP links from admin
    add_action('wp_before_admin_bar_render', function () {
        global $wp_admin_bar;
        $wp_admin_bar->remove_menu('wp-logo'); // Remove the WordPress logo
        $wp_admin_bar->remove_menu('about'); // Remove the about WordPress link
        $wp_admin_bar->remove_menu('wporg'); // Remove the WordPress.org link
        $wp_admin_bar->remove_menu('documentation'); // Remove the WordPress documentation
        $wp_admin_bar->remove_menu('support-forums'); // Remove the support forums link
        $wp_admin_bar->remove_menu('feedback'); // Remove the feedback link
        $wp_admin_bar->remove_menu('updates'); // Remove the updates link
        $wp_admin_bar->remove_menu('comments'); // Remove the comments link
    }, 999);

    // Hide 'Editor' link in the bottom of the Appearance menu.
    add_action('_admin_menu', function () {
        remove_action('admin_menu', '_add_themes_utility_last', 101);
    }, 1);

    // Remove default widgets
    add_action('widgets_init', function () {
        unregister_widget('WP_Widget_Archives');
        unregister_widget('WP_Widget_Calendar');
        unregister_widget('WP_Widget_Categories');
        unregister_widget('WP_Widget_Meta');
        unregister_widget('WP_Widget_Pages');
        unregister_widget('WP_Widget_Recent_Comments');
        unregister_widget('WP_Widget_Recent_Posts');
        unregister_widget('WP_Widget_RSS');
        unregister_widget('WP_Widget_Search');
        unregister_widget('WP_Widget_Tag_Cloud');
        unregister_widget('WP_Widget_Text');
        unregister_widget('WP_Nav_Menu_Widget');
    });

    // Remove wordpress news
    add_action('wp_dashboard_setup', function () {
        remove_meta_box('dashboard_primary', 'dashboard', 'side');
        remove_meta_box('dashboard_secondary', 'dashboard', 'side');
    });
}
// Remove admin bar
add_filter('show_admin_bar', '__return_false');

// Remove comments from WP
add_action('admin_init', function () {
    // Redirect any user trying to access comments page
    global $pagenow;

    if ($pagenow === 'edit-comments.php') {
        wp_redirect(admin_url());
        exit;
    }

    // Remove comments metabox from dashboard
    remove_meta_box('dashboard_recent_comments', 'dashboard', 'normal');

    // Disable support for comments and trackbacks in post types
    foreach (get_post_types() as $post_type) {
        if (post_type_supports($post_type, 'comments')) {
            remove_post_type_support($post_type, 'comments');
            remove_post_type_support($post_type, 'trackbacks');
        }
    }
});

// Remove comments page in menu
add_action('admin_menu', function () {
    remove_menu_page('edit-comments.php');
});

// Close comments on the front-end
add_filter('comments_open', '__return_false', 20, 2);
add_filter('pings_open', '__return_false', 20, 2);

// Hide existing comments
add_filter('comments_array', '__return_empty_array', 10, 2);

// Remove comments links from admin bar
add_action('init', function () {
    if (is_admin_bar_showing()) {
        remove_action('admin_bar_menu', 'wp_admin_bar_comments_menu', 60);
    }
});

// Remove unneeded dashboard menu items
add_action('admin_menu', function () {
    remove_menu_page('edit-comments.php'); //Comments
});

// ---------------------------------------------- FRONTEND TWEAKS

// Remove unneeded classes & IDs from menu items
// add_filter('nav_menu_css_class', 'remove_nav_styles');
// add_filter('nav_menu_item_id', 'remove_nav_styles');
// add_filter('page_css_class', 'remove_nav_styles');
// add_filter('nav_menu_item_id', '__return_false');

// function remove_nav_styles($var)
// {
//     // Allow custom styles
//     $allow = array();
//     return is_array($var) ? array_intersect($var, $allow) : '';
// }

// Remove EMOJIS
add_action('init', 'disable_emoji_feature');
function disable_emoji_feature()
{

    // Prevent Emoji from loading on the front-end
    remove_action('wp_head', 'print_emoji_detection_script', 7);
    remove_action('wp_print_styles', 'print_emoji_styles');

    // Remove from admin area also
    remove_action('admin_print_scripts', 'print_emoji_detection_script');
    remove_action('admin_print_styles', 'print_emoji_styles');

    // Remove from RSS feeds also
    remove_filter('the_content_feed', 'wp_staticize_emoji');
    remove_filter('comment_text_rss', 'wp_staticize_emoji');

    // Remove from Embeds
    remove_filter('embed_head', 'print_emoji_detection_script');

    // Remove from emails
    remove_filter('wp_mail', 'wp_staticize_emoji_for_email');

    // Disable from TinyMCE editor. Currently disabled in block editor by default
    add_filter('tiny_mce_plugins', 'disable_emojis_tinymce');

    /* Finally, prevent character conversion too
     ** without this, emojis still work
     ** if it is available on the user's device
     */

    add_filter('option_use_smilies', '__return_false');

    // Remove Emoji dns prefetch
    add_filter('emoji_svg_url', '__return_false');

    function disable_emojis_tinymce($plugins)
    {
        if (is_array($plugins)) {
            $plugins = array_diff($plugins, array('wpemoji'));
        }
        return $plugins;
    }

}
