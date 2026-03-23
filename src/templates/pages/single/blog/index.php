<section class="hero-intro" data-theme="dark">
  <div class="container" data-stagger='fadeup'>
    <div class="section-heading">
      <div data-item>
        <div class="date"><?php echo get_the_date("d.m.Y"); ?></div>
      </div>
      <?php
      $categories = get_the_terms(get_the_ID(), 'blog_category');
      ?>

      <?php if ($categories && !is_wp_error($categories)) {  ?>
        <div class="categories" data-item>
          <?php
          $cat_links = array();
          foreach ($categories as $cat) {
            echo '<a href="' . esc_url(get_term_link($cat)) . '">' . esc_html($cat->name) . '</a>';
          }
          ?>
        </div>
      <?php } ?>



      <h1 class="font-60" data-item><?php the_title(); ?></h1>
      <div data-item>
        <div class="subtitle font-24"><?php the_excerpt(); ?></div>
      </div>
    </div>
  </div>
</section>

<section class="post-content">
  <div class="container">
    <div class="the_content content" data-fade='up'>
      <?php the_content(); ?>
    </div>
  </div>
</section>