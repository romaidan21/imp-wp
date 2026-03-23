<?php
$menu = wp_nav_menu([
  'theme_location' => "header_menu",
  'container'      => null,
  'items_wrap'     => '<ul class="pages">%3$s</ul>',
  'echo'           => false,
  'fallback_cb'    => null,
  'depth'          => 2
]);


?>

<header class="header" data-theme="dark">
  <div class="container">
    <?php renderLogo(false) ?>

    <?php echo $menu; ?>

    <button class="mobile-toggle" type="button" aria-label="Відкрити меню">
      <span></span>
      <span></span>
      <span></span>
    </button>
  </div>
</header>