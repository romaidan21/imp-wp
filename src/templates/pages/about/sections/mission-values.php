<?php
$items = $args['items'] ?? [];
if (empty($items)) return;
?>
<section class="mission">
  <div class="container">
    <div class="section-heading centered">
      <h2 class="title font-48"><?php echo esc_html($args['title'] ?? ''); ?></h2>
      <div class="divider"></div>
    </div>
    <div class="grid mt-lg">
      <?php foreach ($items as $item): ?>
        <article class="panel">
          <h3 class="title font-28">
            <span class="title-line"></span>
            <?php echo esc_html($item['title'] ?? ''); ?>
          </h3>
          <?php if (!empty($item['content'])): ?>
            <div class="the_content content">
              <?php echo wp_kses_post($item['content']); ?>
            </div>
          <?php endif; ?>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>