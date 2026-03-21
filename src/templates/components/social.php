<?php
$url = $args['url'] ?? '';
$attr = $args['attr'] ?? '';
$title = $args['title'] ?? $url;
$icon = $args['icon'] ?? '';
$mask = $args['mask'] ?? '';

$aria_label = $title ? "aria-label=\"{$title}\"" : '';
$style = $mask ? "style=\"mask-image: url(" . $mask . ");\"" : '';
?>


<a href="<?php echo $url ?>" class="icon" <?php echo $attr; ?> <?php echo $aria_label ?> target="_blank" >
<div class="mask" <?php echo $style ?> ></div>
</a>