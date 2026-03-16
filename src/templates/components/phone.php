<?php 
$class = $args['class'] ?? '';
$url = $args['url'] ?? '';
$attr = $args['attr'] ?? '';
$title = $args['title'] ?? $url;
$before = $args['before'] ?? '';
$icon = $args['icon'] ?? '';

$aria_label = $title ? "aria-label=\"{$title}\"" : '';
?>


<a href="<?php phoneToLink($url) ?>" class="<?php echo $class ?>" <?php echo $attr ?> <?php echo $aria_label; ?> >
  <?php echo $icon ? renderSVG($icon) : ''; echo $before; echo $url; ?>
</a>