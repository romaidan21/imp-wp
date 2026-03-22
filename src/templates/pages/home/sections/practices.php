<section class="practices">
  <div class="container">
    <div class="section-heading centered">
      <h2 class="title font-48">Ключові практики</h2>
      <div class="divider"></div>
    </div>

    <?php
    $practices = BambooPosts::getServicePosts();
    ?>
    <div class="grid mt-lg">
      <?php foreach ($practices as $practice): ?>
        <?php renderComponent('card-service', $practice); ?>
      <?php endforeach; ?>
    </div>

    <div class="actions flex-c mt-lg">
      <a href="/services" class="cta stroke">Всі послуги</a>
    </div>
  </div>
</section>