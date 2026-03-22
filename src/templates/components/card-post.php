<?php
$href = $args['href'] ?? '#';
$title = $args['title'] ?? 'Назва послуги';
$excerpt = $args['excerpt'] ?? 'Короткий опис послуги для залучення уваги користувача.';
$tag = $args['tag'] ?? 'Аналітика';
$date = $args['date'] ?? '24.02.2026';
$ctaText = $args['cta_text'] ?? 'Читати далі';

?>

<a class="post-item" href="<?php echo $href; ?>">
  <div class="thumb fit-cover">
    <?php renderTempImage('temp.png'); ?>
  </div>
  <div class="content">
    <div class="meta">
      <span class="tag"><?php echo $tag; ?></span>
      <span class="date"><?php echo $date; ?></span>
    </div>
    <h3 class="title font-22"><?php echo $title; ?></h3>
    <p class="excerpt"><?php echo $excerpt; ?></p>
    <span class="cta empty"><?php echo $ctaText; ?></span>
  </div>
</a>