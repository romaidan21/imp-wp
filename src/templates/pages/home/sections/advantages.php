<?php
$title = $args['title'] ?? '';
$items = $args['items'] ?? [];
if (empty($items)) return;

?>
<section class="advantages" data-theme="dark">
  <div class="container advantages__container">

    <div class="section-heading">
      <?php if ($title): ?>
        <h2 class="font-48"><?php echo $title; ?></h2>
      <?php endif; ?>
      <div class="divider"></div>
    </div>

    <div class="grid mt-lg">
      <?php if (!empty($items)): ?>
        <?php foreach ($items as $item): ?>
          <div class="item">
            <div class="icon fit-cover">
              <?php if (!empty($item['icon'])): ?>
                <?php echo wp_get_attachment_image($item['icon'], 'full', false, [
                  'loading' => 'lazy',
                  'alt' => $title
                ]) ?>
              <?php endif; ?>
            </div>
            <h3 class="title font-22"><?php echo $item['g']['title'] ?? ''; ?></h3>
            <p class="text"><?php echo nl2br($item['g']['text'] ?? ''); ?></p>
          </div>
        <?php endforeach; ?>
      <?php endif; ?>
    </div>
  </div>
</section>