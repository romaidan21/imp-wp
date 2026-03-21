<?php
$class   = $args['class'] ?? "";
$socials = $args['socials'] ?? [];

if ($socials): ?>
  <div class="social-icons <?php echo $class ?>">
    <?php foreach ($socials as $social):
      renderComponent('social', [
        'url' => $social['url'] ?? '',
        'mask' => $social['custom_icon'] ?? '',
      ]);
    endforeach; ?>
  </div>
<?php endif; ?>