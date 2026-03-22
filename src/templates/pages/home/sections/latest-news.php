<section class="news">
  <div class="container">
    <div class="section-heading">
      <h2 class="title font-48">Останні новини</h2>
      <div class="divider"></div>
    </div>

    <?php
    $articles = BambooPosts::getBlogPosts(['posts_per_page' => 3]);

    ?>
    <div class="grid mt-lg">
      <?php foreach ($articles as $article) {
        renderComponent('card-post', $article);
      } ?>
    </div>

    <div class="actions flex-c mt-lg">
      <a href="/blog" class="cta stroke">Всі новини</a>
    </div>
  </div>
</section>