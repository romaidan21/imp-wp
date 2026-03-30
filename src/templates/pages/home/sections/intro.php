<?php
$title = $args['title'] ?? '';
$supertitle = $args['supertitle'] ?? '';
$button = $args['button'] ?? null;
$button_2 = $args['button_2'] ?? null;
?>


<section class="intro" data-theme="dark">
  <div class="media fit-cover">
    <?php if (has_post_thumbnail()): ?>
      <?php the_post_thumbnail('full', ['data-fade' => 'in']); ?>
    <?php endif; ?>
    <div class="overlay"></div>
  </div>

  <div class="container " data-stagger='fadeup'>
    <div class="main-logo" data-home-logo></div>
    <?php if ($title): ?>
      <div class="font-72"><?php echo $title ?></div>
    <?php endif; ?>
    <?php if ($supertitle): ?>
      <div data-item>
        <p class="subtitle font-24"><?php echo $supertitle; ?></p>

      </div>
    <?php endif; ?>
    <div class="actions" data-item>

      <?php if ($button && isset($button['url'], $button['title'])): ?>
        <a href="<?php echo $button['url'] ?>" class="cta gold"><?php echo $button['title'] ?></a>
      <?php endif; ?>
      <?php if ($button_2 && isset($button_2['url'], $button_2['title'])): ?>
        <a href="<?php echo $button_2['url'] ?>" class="cta stroke"><?php echo $button_2['title'] ?></a>
      <?php endif; ?>
    </div>
  </div>
</section>