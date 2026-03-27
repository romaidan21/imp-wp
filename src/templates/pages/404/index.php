<?php

?>
<section class="not-found">
  <div class="container" data-stagger='fadeup'>
    <div class="not-found__inner" data-item>
      <p class="not-found__code font-72" data-item>404</p>
      <h1 class="not-found__title font-48" data-item>Сторінку не знайдено</h1>
      <p class="not-found__text font-22" data-item>
        Схоже, що сторінка була переміщена або посилання застаріло.
        Спробуйте повернутися на головну або переглянути наші послуги.
      </p>

      <div class="not-found__actions" data-item>
        <a href="<?php echo esc_url(home_url('/')); ?>" class="cta gold">На головну</a>
        <a href="<?php echo esc_url(home_url('/services')); ?>" class="cta stroke">Послуги</a>
      </div>
    </div>
  </div>
</section>