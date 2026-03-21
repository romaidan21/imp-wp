<section class="practices">
  <div class="container">
    <div class="section-heading centered">
      <h2 class="title font-48">Ключові практики</h2>
      <div class="divider"></div>
    </div>

    <?php
    $practices = [
      [
        'href' => '/services/corporate-law',
        'icon' => 'KP',
        'title' => 'Корпоративне право',
        'description' => 'Комплексний юридичний супровід та захист інтересів у даній сфері.',
        'cta_text' => 'Читати далі',
      ],
      [
        'href' => '/services/commercial-law',
        'icon' => 'GP',
        'title' => 'Господарське право',
        'description' => 'Комплексний юридичний супровід та захист інтересів у даній сфері.',
        'cta_text' => 'Читати далі',
      ],
      [
        'href' => '/services/court-representation',
        'icon' => 'SP',
        'title' => 'Судове представництво',
        'description' => 'Комплексний юридичний супровід та захист інтересів у даній сфері.',
        'cta_text' => 'Читати далі',
      ],
    ];
    ?>
    <div class="grid mt-lg">
      <?php foreach ($practices as $practice): ?>
        <div>
          <?php renderComponent('card-service', $practice); ?>
        </div>
      <?php endforeach; ?>
    </div>

    <div class="actions flex-c mt-lg">
      <a href="/services" class="cta stroke">Всі послуги</a>
    </div>
  </div>
</section>