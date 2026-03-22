<?php

$data = get_field('single-service');


?>
<section class="hero-intro" data-theme="dark">
  <div class="container">
    <div class="section-heading">
      <h1 class="font-60"><?php the_title(); ?></h1>
      <div class="subtitle font-24"><?php the_excerpt(); ?></div>
    </div>

    <div class="thumb fit-cover">
      <?php echo wp_get_attachment_image($data['icon'] ?? '', 'full', false, [
        'loading' => 'lazy',
        'alt' => $title
      ]) ?>
    </div>
  </div>
</section>

<section class="post-content">
  <div class="container">
    <div class="the_content content">
      <?php echo $data['content']; ?>
    </div>
  </div>
</section>