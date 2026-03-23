<?php
$documents = BambooPosts::getDocuments();
$info = $args['info'] ?? '';
?>


<section class="documents">


  <div class="container">
    <?php if (isset($info) && !empty($info)): ?>
      <div class="notice" data-fade='up'>
        <div class="icon fi-cover" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
            <path d="M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"></path>
            <path d="m9 18-1.5-1.5"></path>
            <circle cx="5" cy="14" r="3"></circle>
          </svg>
        </div>
        <div class="the_content content">
          <?php echo $info; ?>
        </div>
      </div>
    <?php endif; ?>



    <div class="list  <?php if (isset($info) && !empty($info)) echo 'mt-lg'; ?>" data-stagger='fadeup'>
      <?php foreach ($documents as $doc):
        $acf = get_field('document-data', $doc->ID);
        $title = $doc->post_title;
      ?>
        <div data-item>

          <a class="doc" href="<?php echo $acf['file']['url']; ?>" target="_blank">
            <div class="type flex-c font-28">
              <span aria-hidden="true">
                <?php echo $acf['file']['subtype']; ?>
              </span>
            </div>
            <div class="content">
              <div class="top">
                <h3 class="title font-22"><?php echo $title; ?></h3>
                <span class="category"><?php echo $acf['g']['tag']; ?></span>
              </div>
              <p class="description"><?php echo $acf['g']['description']; ?></p>
            </div>
            <div class="download"></div>
          </a>
        </div>
      <?php endforeach; ?>
    </div>
  </div>

</section>