<section class="documents">


  <div class="container">
    <div class="notice">
      <div class="icon fi-cover" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
          <path d="M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"></path>
          <path d="m9 18-1.5-1.5"></path>
          <circle cx="5" cy="14" r="3"></circle>
        </svg>
      </div>
      <div class="the_content content">
        <p><strong>Зверніть увагу</strong></p>
        <p>Ці шаблони є типовими зразками. Для врахування специфіки вашої діяльності та максимального захисту ваших інтересів, рекомендуємо звернутись за індивідуальною розробкою договору до наших спеціалістів.</p>
      </div>
    </div>



    <?php
    $documents = [
      [
        'type' => 'pdf',
        'title' => 'Шаблон договору про надання послуг',
        'category' => 'Договори',
        'description' => 'Базовий шаблон для оформлення B2B-відносин з надання послуг.',
        'href' => '#',
        'download_text' => 'Завантажити',
      ],
      [
        'type' => 'doc',
        'title' => 'Шаблон договору про нерозголошення (NDA)',
        'category' => 'Конфіденційність',
        'description' => 'Шаблон для захисту конфіденційної інформації компанії.',
        'href' => '#',
        'download_text' => 'Завантажити',
      ],
      [
        'type' => 'pdf',
        'title' => 'Шаблон довіреності',
        'category' => 'Представництво',
        'description' => 'Типовий шаблон довіреності для представництва інтересів.',
        'href' => '#',
        'download_text' => 'Завантажити',
      ],
    ];
    ?>
    <div class="list mt-lg">
      <?php foreach ($documents as $doc): ?>
        <a class="doc" href="<?php echo $doc['href']; ?>">
          <div class="type flex-c font-28">
            <span aria-hidden="true">
              <?php echo strtoupper($doc['type']); ?>
            </span>
          </div>
          <div class="content">
            <div class="top">
              <h3 class="title font-22"><?php echo $doc['title']; ?></h3>
              <span class="category"><?php echo $doc['category']; ?></span>
            </div>
            <p class="description"><?php echo $doc['description']; ?></p>
          </div>
          <div class="download"></div>
        </a>
      <?php endforeach; ?>
    </div>
  </div>

</section>