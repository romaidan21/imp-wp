<?php
$menu = wp_nav_menu([
  'theme_location' => "header_menu",
  'container'      => null,
  'items_wrap'     => '<nav class="pages">%3$s</nav>',
  'echo'           => false,
  'fallback_cb'    => null,
  'depth'          => 2
]);


?>

<header class="header">
  <div class="container">
    <?php renderLogo(false) ?>

    <?php echo $menu; ?>



    <!-- <a href="/contacts" class="cta gold">Замовити консультацію</a> -->

    <button class="mobile-toggle" type="button" aria-label="Відкрити меню">
    </button>
  </div>
</header>