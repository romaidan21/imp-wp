<?php
$class = $args['class'] ?? "";
$title = $args['title'] ?? "";
$hideText = $args['hide_text'] ?? false;
$link = $args['url'] ?? '';
$type = $args['type'] ?? 'button';
$attr = $args['attr'] ?? '';
$target = $args['target'] ?? "_self";
$icon = $args['icon'] ?? null;
$elType = $link ? 'a' : 'button';
$specificAttrs = $link ? "href=\"{$link}\" target=\"{$target}\"" : "type=\"{$type}\"";
$ariaLabel = "aria-label=\"{$title}\"";
?>

<<?php echo $elType; ?>
  class="btn <?php echo $class; ?>"
  <?php echo $specificAttrs; ?>
  <?php echo $ariaLabel; ?>
  <?php echo ($attr) ? " {$attr}" : ''; ?>
  role="<?php echo $link ? 'link' : 'button'; ?>">
  <?php if ($icon): ?>
    <div class="btn-icon" aria-hidden="true">
      <?php renderSVG('img/icons/' . $icon); ?>
    </div>
  <?php endif; ?>
  <?php if (!$hideText) : ?>
    <div class="btn-text"><?php echo $title; ?></div>
  <?php endif; ?>
</<?php echo $elType; ?>>