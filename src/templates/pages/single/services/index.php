<?php

$data = get_field('single-service');
$args = get_field('consultation', 'options');


?>
<section class="hero-intro" data-theme="dark">
  <div class="container" data-stagger='fadeup'>
    <div class="thumb fit-cover" data-item>
      <?php echo wp_get_attachment_image($data['icon'] ?? '', 'full', false, [
        'loading' => 'lazy',
        'alt' => $title
      ]) ?>
    </div>
    <div class="section-heading">
      <h1 class="font-60" data-item><?php the_title(); ?></h1>
      <div data-item>
        <div class="subtitle font-24"><?php the_excerpt(); ?></div>
      </div>
    </div>


  </div>
</section>

<section class="post-content flex-v x-center">
  <div class="container">
    <div class="the_content content" data-fade='up'>
      <?php echo $data['content']; ?>
    </div>
  </div>

  <div class="container container-cta" data-theme="dark" data-fade='up'>
    <div class="section-heading centered">
      <h2 class="title font-48">
        <?php echo $args['title']; ?>
      </h2>
      <p class="subtitle font-18">
        <?php echo $args['subtitle']; ?>
      </p>
      <a href="<?php echo $args['link']['url']; ?>" class="cta gold"><?php echo $args['link']['title']; ?></a>
    </div>
  </div>
</section>