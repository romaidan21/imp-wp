<?php
$items = $args['items'] ?? [];
if (empty($items)) return;
?>
<section class="principles">
  <div class="container">
    <div class="section-heading centered" data-fade='up'>
      <h2 class="title font-48"><?php echo esc_html($args['title'] ?? ''); ?></h2>
      <div class="divider"></div>
    </div>

    <div class="list flex-v mt-lg">
      <?php foreach ($items as $item): ?>
        <article class="item" data-fade='up'>
          <div class="item__text">
            <div>
              <h3 class="font-28"><?php echo esc_html($item['g']['title'] ?? ''); ?></h3>
              <?php if (!empty($item['g']['content'])): ?>
                <div class="the_content content">
                  <?php echo wp_kses_post($item['g']['content']); ?>
                </div>
              <?php endif; ?>
            </div>
          </div>
          <div class="thumb fit-cover">
            <?php echo wp_get_attachment_image($item['image'] ?? '', 'full', false, [
              'loading' => 'lazy',
              'sizes' => '(max-width: 768px) 300px, 400px',
              'alt' => $item['g']['title'] ?? ''
            ]) ?>
          </div>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>