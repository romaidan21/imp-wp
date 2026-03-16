<?php
$class = $args['class'] ?? "";
$url = $args['url'] ?? '';
$attr = $args['attr'] ?? '';
$title = $args['title'] ?? $url;
$icon = $args['icon'] ?? '';

$aria_label = $title ? "aria-label=\"{$title}\"" : '';
?>


<a href="<?php echo $url ?>" class="<?php echo $class ?>" <?php echo $attr; ?> <?php echo $aria_label ?> target="_blank">
  <?php echo $icon ? renderSVG($icon) : '' ?>
</a>