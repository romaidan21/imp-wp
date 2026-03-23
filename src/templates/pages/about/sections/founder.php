<?php
$photo = $args['photo'] ?? '';
$name = $args['g']['name'] ?? '';
$position = $args['g']['position'] ?? '';
$content = $args['g']['content'] ?? '';
?>
<section class="founder">
  <div class="container">
    <div class="founder__layout">
      <div class="founder__thumb fit-cover">
        <?php echo wp_get_attachment_image($photo, 'full', false, [
          'loading' => 'lazy',
          'sizes' => '(max-width: 768px) 300px, 400px',
          'alt' => $name
        ]) ?>
      </div>
      <div>
        <h2 class="founder__name font-48"><?php echo esc_html($name); ?></h2>
        <p class="founder__role font-22"><?php echo esc_html($position); ?></p>

        <div class="the_content content">
          <?php echo wp_kses_post($content); ?>
        </div>
      </div>
    </div>
  </div>
</section>