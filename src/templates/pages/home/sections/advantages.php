<?php
$advantages = [
  [
    'icon' => '../shield.svg',
    'title' => 'Досвід у складних справах',
    'text' => 'Ми успішно вирішуємо найскладніші юридичні завдання.'
  ],
  [
    'icon' => '../shield.svg',
    'title' => 'Міжнародні контракти',
    'text' => 'Супровід зовнішньоекономічної діяльності.'
  ],
  [
    'icon' => '../shield.svg',
    'title' => 'Індивідуальний підхід',
    'text' => 'Глибоке занурення в специфіку бізнесу клієнта.'
  ],
  [
    'icon' => '../shield.svg',
    'title' => 'Конфіденційність',
    'text' => 'Абсолютна безпека ваших даних та інформації.'
  ],
];
?>
<section class="advantages" data-theme="dark">
  <div class="container advantages__container">
    <div class="section-heading">
      <h2 class="font-48">Чому обирають нас</h2>
      <div class="divider"></div>
    </div>

    <div class="grid mt-lg">
      <?php foreach ($advantages as $item): ?>
        <div class="item">
          <div class="icon fit-cover"><?php renderTempImage($item['icon']) ?></div>
          <h3 class="title font-22"><?= $item['title'] ?></h3>
          <p class="text"><?= $item['text'] ?></p>
        </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>