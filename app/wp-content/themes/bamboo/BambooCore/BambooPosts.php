<?php if (!defined('ABSPATH')) exit;

class BambooPosts
{

  public static $default =
  [
    'posts_per_page' => -1,
    'post_status' => 'publish',
    'suppress_filters' => false,
  ];

  public static function getBlogPosts($args = [])
  {
    return get_posts(
      [
        'post_type' => 'blog',
        ...self::$default,
        ...$args,
      ]
    );
  }
  public static function getServicePosts($args = [])
  {
    return get_posts(
      [
        'post_type' => 'services',
        ...self::$default,
        ...$args,
      ]
    );
  }
}
