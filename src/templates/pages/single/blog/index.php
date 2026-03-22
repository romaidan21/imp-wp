<section class="hero-intro" data-theme="dark">
  <div class="container">
    <div class="section-heading">
      <div class="date"><?php echo get_the_date("d.m.Y"); ?></div>
      <?php
      $categories = get_the_terms(get_the_ID(), 'blog_category');
      ?>

      <?php if ($categories && !is_wp_error($categories)) {  ?>
        <div class="categories">
          <?php
          $cat_links = array();
          foreach ($categories as $cat) {
            echo '<a href="' . esc_url(get_term_link($cat)) . '">' . esc_html($cat->name) . '</a>';
          }
          ?>
        </div>
      <?php } ?>



      <h1 class="font-60"><?php the_title(); ?></h1>
      <div class="subtitle font-24"><?php the_excerpt(); ?></div>
    </div>
  </div>
</section>

<section class="post-content">
  <div class="container">
    <div class="the_content content">
      <?php the_content(); ?>
    </div>
  </div>
</section>