<?php
$href = $args['href'] ?? '#';
$icon = $args['icon'] ?? 'default-icon.svg';
$title = $args['title'] ?? 'Назва послуги';
$description = $args['description'] ?? 'Короткий опис послуги для залучення уваги користувача.';
$ctaText = $args['cta_text'] ?? 'Читати далі';

?>


<a class="card-service flex-v" href="<?php echo $href; ?>">
  <div class="icon flex-c"><?php echo $icon; ?></div>
  <h3 class="title font-22"><?php echo $title; ?></h3>
  <p class="text"><?php echo $description; ?></p>
  <span class="cta empty"><?php echo $ctaText; ?></span>
</a>