<?php
$title = $args['title'] ?? get_the_title();
$subtitle = $args['subtitle'] ?? get_field('page-description');
?>

<section class="hero-intro" data-theme="dark">
  <div class="container">
    <div class="section-heading centered">
      <h1 class="font-60">
        <?php echo $title; ?>
      </h1>
      <p class="subtitle font-24"><?php echo $subtitle; ?></p>
      <div class="divider"></div>
    </div>
  </div>
</section>