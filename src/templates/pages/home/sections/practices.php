<?php
$title = $args['title'] ?? '';
$items = $args['items'] ?? [];
$button = $args['button'] ?? null;

if (empty($items)) return;

?>


<section class="practices">
  <div class="container">
    <?php if ($title): ?>
      <div class="section-heading centered" data-fade='up'>
        <h2 class="title font-48"><?php echo $title ?></h2>
        <div class="divider"></div>
      </div>
    <?php endif; ?>

    <div class="grid mt-lg" data-stagger='fadeup'>
      <?php if (!empty($items)): ?>
        <?php foreach ($items as $practice): ?>
          <?php renderComponent('card-service', $practice); ?>
        <?php endforeach; ?>
      <?php endif; ?>
    </div>

    <div class="actions flex-c mt-lg" data-fade='up'>
      <?php if ($button && isset($button['url'], $button['title'])): ?>
        <a href="<?php echo $button['url']; ?>" class="cta stroke"><?php echo $button['title']; ?></a>
      <?php endif; ?>
    </div>
  </div>
</section>