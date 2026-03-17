<?php

?>
<div class="contact-page page-shell">
  <?php renderSection('header'); ?>

  <div class="container contact-page__content">
    <div class="contact-page__grid">
      <?php
      renderSection('info');
      renderSection('form');
      ?>
    </div>

    <?php renderSection('map'); ?>
  </div>
</div>