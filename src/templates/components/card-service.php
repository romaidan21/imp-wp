<?php
$href = get_permalink($args->ID);
$title = $args->post_title;
$excerpt = $args->post_excerpt;
$ctaText = $args->cta_text ?? 'Читати далі';
$data = get_field('single-service', $args->ID);

?>


<a class="card-service flex-v" href="<?php echo $href; ?>">
  <div class="icon flex-c">
    <?php echo wp_get_attachment_image($data['icon'] ?? '', 'full', false, [
      'loading' => 'lazy',
      'alt' => $title
    ]) ?>
  </div>
  <h3 class="title font-22"><?php echo $title; ?></h3>
  <p class="text"><?php echo $excerpt; ?></p>
  <span class="cta empty"><?php echo $ctaText; ?></span>
</a>