<?php 

// if (get_current_user_id() != 1) return;

panda_get_header(); ?>

<?php 

$args['tabs'] = [
  ['title' => 'Email', 'template' => 'mail'],
  ['title' => 'Database', 'template' => 'database'],
  ['title' => 'Php', 'template' => 'phpinfo'],
  ['title' => 'Users', 'template' => 'users'],
  ['title' => 'CPT', 'template' => 'cpt'],
  ['title' => 'API', 'template' => 'api'],
  ['title' => 'WPML', 'template' => 'wpml'],

];

$active_tab = !empty($_GET['template']) ? $_GET['template'] : $args['tabs'][0]['template'];
?>

<section class="main">
  <div class="container">
    <div class="section-heading">
      <h1>Bamboo tools</h1>

      <div class="heading-tabs">
        <?php foreach($args['tabs'] as $key => $item): ?>
          <button class="tabs-item <?php echo $item['template'] == $active_tab ? 'active' : '' ?>" data-tab-index="<?php echo $key ?>"><?php echo $item['title'] ?? '' ?></button>
        <?php endforeach ?>
      </div>
    </div>

    <div class="section-content">
    <?php foreach($args['tabs'] as $key => $item): ?>
        <div class="content-item <?php echo $item['template'] == $active_tab ? 'active' :'' ?>" data-content-index="<?php echo $key ?>" data-template="<?php echo $item['template'] ?? '' ?>">
          <?php panda_render_template('tabs/'.$item['template']); ?>
        </div>
        <?php endforeach ?>
    </div>
  </div>
</section>