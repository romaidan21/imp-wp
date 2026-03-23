<?php
$title = $args['title'] ?? get_the_title();
$subtitle = $args['subtitle'] ?? get_field('page-description');
?>

<section class="hero-intro" data-theme="dark">
  <div class="container" data-stagger='fadeup'>
    <div class="section-heading centered">
      <h1 class="font-60" data-item>
        <?php echo $title; ?>
      </h1>

      <?php if (!empty($subtitle)) : ?>
        <div data-item>
          <p class="subtitle font-24"><?php echo $subtitle; ?></p>
        </div>
      <?php endif; ?>

      <div class="divider" data-item></div>
    </div>
  </div>
</section>