<?php


$ctaText =  'Читати далі';

$id = $args->ID;

$title = $args->post_title;
$excerpt = $args->post_excerpt;
$date = get_the_date("d.m.Y", $args->ID);
$href = get_permalink($args->ID);

$categories = get_the_terms($args->ID, 'blog_category');


$catsIDs = [];
if ($categories && !is_wp_error($categories)) {
  foreach ($categories as $cat) {
    $catsIDs[] = $cat->term_id;
  }
}

?>



<a class="post-item" href="<?php echo $href; ?>" data-categories="<?php echo implode(',', $catsIDs); ?>">
  <div class="thumb fit-cover">
    <?php echo get_the_post_thumbnail(
      $id,
      'full',
      [
        'loading' => 'lazy',
        'sizes' => '(max-width: 768px) 300px, 400px',
        'alt' => $title
      ]
    ); ?>
  </div>
  <div class="content">
    <div class="meta">
      <?php if ($categories && !is_wp_error($categories)) {  ?>
        <?php
        foreach ($categories as $cat) {
          echo '<span class="tag">' . esc_html($cat->name) . '</span>';
        }
        ?>
      <?php } ?>
      <span class="date"><?php echo $date; ?></span>
    </div>
    <h3 class="title font-22"><?php echo $title; ?></h3>
    <p class="excerpt"><?php echo $excerpt; ?></p>
    <span class="cta empty"><?php echo $ctaText; ?></span>
  </div>
</a>