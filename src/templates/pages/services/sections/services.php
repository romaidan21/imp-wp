    <?php
    $posts = BambooPosts::getServicePosts();
    ?>



    <section class="services">
      <div class="container">
        <div class="grid ">
          <?php foreach ($posts as $post): ?>
            <?php renderComponent('card-service', $post); ?>
          <?php endforeach; ?>
        </div>
      </div>
    </section>