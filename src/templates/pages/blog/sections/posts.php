    <?php
    $articles = [
      [
        'href' => '/events?id=1',
        'tag' => 'Аналітика',
        'date' => '24.02.2026',
        'title' => 'Як зменшити ризики у договорах у 2026 році',
        'excerpt' => 'Практичний чекліст для бізнесу перед підписанням господарських договорів.',
        'cta_text' => 'Читати далі',
      ],
      [
        'href' => '/events?id=2',
        'tag' => 'Кейси',
        'date' => '18.01.2026',
        'title' => 'Успішне представництво у корпоративному спорі',
        'excerpt' => 'Кейс: захист прав учасника товариства та відновлення корпоративного управління.',
        'cta_text' => 'Читати далі',
      ],
      [
        'href' => '/events?id=3',
        'tag' => 'Законодавство',
        'date' => '05.12.2025',
        'title' => 'Ключові зміни законодавства для роботодавців',
        'excerpt' => 'Огляд оновлень, що впливають на HR-процеси, трудові договори та комплаєнс.',
        'cta_text' => 'Читати далі',
      ],
    ];
    ?>


    <section class="posts">
      <div class="container">
        <div class="filters">
          <div class="tags">
            <button class="tag active">Всі</button>
            <button class="tag">Аналітика</button>
            <button class="tag">Кейси</button>
            <button class="tag">Законодавство</button>
            <button class="tag">Поради</button>
          </div>
          <div class="search">
            <span class="search-icon" aria-hidden="true"></span>
            <input placeholder="Пошук статей..." class="search-input" />
          </div>
        </div>

        <div class="grid mt-lg">
          <?php foreach ($articles as $article) {
            renderComponent('card-post', $article);
          } ?>
        </div>

      </div>
    </section>