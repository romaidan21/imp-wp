<?php
$title = $args['title'] ?? '';
$button = $args['button'] ?? null;
$articles = BambooPosts::getBlogPosts(['posts_per_page' => 3]);
if (empty($articles)) return;

?>
<section class="news">
  <div class="container">

    <?php if ($title): ?>
      <div class="section-heading" data-fade='up'>
        <h2 class="title font-48"><?php echo $title; ?></h2>
        <div class="divider"></div>
      </div>
    <?php endif; ?>

    <?php
    ?>
    <div class="grid mt-lg" data-fade='up'>
      <?php foreach ($articles as $article) {
        renderComponent('card-post', $article);
      } ?>
    </div>

    <div class="actions flex-c mt-lg" data-fade='up'>
      <?php if ($button && isset($button['url'], $button['title'])): ?>
        <a href="<?php echo $button['url']; ?>" class="cta stroke"><?php echo $button['title']; ?></a>
      <?php endif; ?>
    </div>
  </div>
</section>