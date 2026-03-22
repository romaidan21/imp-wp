    <?php
    $categories = get_terms(['taxonomy' => cat_name(), 'hide_empty' => true,]);
    $current_term = 0;
    $tax_query = [];
    $term = get_queried_object();

    if (!empty($term->taxonomy) && $term->taxonomy == cat_name()) {
      $current_term = $term->term_id;
      $tax_query = [
        'tax_query' =>
        [
          [
            'taxonomy' => cat_name(),
            'field' => 'term_id',
            'terms' => $current_term,
          ]
        ]
      ];
    }

    $articles = BambooPosts::getBlogPosts([...$tax_query]);

    ?>


    <section class="posts">
      <div class="container">
        <div class="filters">
          <div class="tags">
            <a class="tag<?php echo ($current_term == 0) ? ' active' : ''; ?>" href="<?php echo esc_url(get_post_type_archive_link('post')); ?>">Всі</a>
            <?php foreach ($categories as $category) { ?>
              <a class="tag<?php echo ($category->term_id == $current_term) ? ' active' : ''; ?>" data-category="<?php echo $category->term_id; ?>" href="<?php echo esc_url(get_term_link($category)); ?>">
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