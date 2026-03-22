    <?php
    $articles = BambooPosts::getBlogPosts();
    $categories = get_terms([
      'taxonomy' => 'blog_category',
      'hide_empty' => true,
    ]);
    ?>


    <section class="posts">
      <div class="container">
        <div class="filters">
          <div class="tags">
            <a class="tag active" href="<?php echo esc_url(get_post_type_archive_link('post')); ?>">Всі</a>
            <?php foreach ($categories as $category) { ?>
              <a class="tag" data-category="<?php echo $category->term_id; ?>" href="<?php echo esc_url(get_term_link($category)); ?>">
                <?php echo $category->name; ?>
              </a>
            <?php } ?>

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