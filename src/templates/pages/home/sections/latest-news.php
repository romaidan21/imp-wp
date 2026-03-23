<?php
$title = $args['title'] ?? '';
$button = $args['button'] ?? null;
$articles = BambooPosts::getBlogPosts(['posts_per_page' => 3]);
if (empty($articles)) return;

?>
<section class="news">
  <div class="container">

    <div class="section-heading">
      <?php if ($title): ?>
        <h2 class="title font-48"><?php echo $title; ?></h2>
      <?php endif; ?>
      <div class="divider"></div>
    </div>

    <?php
    ?>
    <div class="grid mt-lg">
      <?php foreach ($articles as $article) {
        renderComponent('card-post', $article);
      } ?>
    </div>

    <div class="actions flex-c mt-lg">
      <?php if ($button && isset($button['url'], $button['title'])): ?>
        <a href="<?php echo $button['url']; ?>" class="cta stroke"><?php echo $button['title']; ?></a>
      <?php endif; ?>
    </div>
  </div>
</section>