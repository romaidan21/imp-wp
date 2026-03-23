<?php
$title = $args['title'] ?? '';
$items = $args['items'] ?? [];
$button = $args['button'] ?? null;

if (empty($items)) return;

?>


<section class="practices">
  <div class="container">
    <div class="section-heading centered">
      <?php if ($title): ?>
        <h2 class="title font-48"><?php echo $title ?></h2>
      <?php endif; ?>
      <div class="divider"></div>
    </div>

    <div class="grid mt-lg">
      <?php if (!empty($items)): ?>
        <?php foreach ($items as $practice): ?>
          <?php renderComponent('card-service', $practice); ?>
        <?php endforeach; ?>
      <?php endif; ?>
    </div>

    <div class="actions flex-c mt-lg">
      <?php if ($button && isset($button['url'], $button['title'])): ?>
        <a href="<?php echo $button['url']; ?>" class="cta stroke"><?php echo $button['title']; ?></a>
      <?php endif; ?>
    </div>
  </div>
</section>