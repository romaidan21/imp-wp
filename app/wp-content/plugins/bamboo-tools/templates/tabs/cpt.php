<?php if (!defined('ABSPATH')) exit;
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$link = site_url() . '/wp-admin/admin.php?page=bb-tools&template=cpt';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'cpt' ? true : false;
$skip_cpts = [
  'attachment',
  'revision',
  'nav_menu_item',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'user_request',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_global_styles',
  'wp_navigation',
  'wp_font_family',
  'wp_font_face',
  'acf-taxonomy',
  'acf-post-type',
  'acf-ui-options-page',
  'acf-field-group',
  'acf-field',

  "nav_menu",
  "link_category",
  "post_format",
  "wp_theme",
  "wp_template_part_area",
  "wp_pattern_category",
  "translation_priority"
];

$post_types = get_post_types();
$taxonomies = get_taxonomies();


?>

<div class="tab-container cpt">
  <h2>CPT Tools</h2>

  <h3>Create posts or pages</h3>

  <form class="grid-12" action="<?php echo $link ?>&step=1" method="POST">
    <div class="section-navihation">
      <select name="cpt">
        <?php foreach ($post_types as $key => $post_type):
          if (in_array($key, $skip_cpts)) continue; ?>

          <option value="<?php echo $key ?>"><?php echo $post_type ?></option>

        <?php endforeach ?>

        <?php foreach ($taxonomies as $key => $post_type):
          if (in_array($key, $skip_cpts)) continue; ?>

          <option value="<?php echo $key ?>"><?php echo $post_type ?> (Taxonomy)</option>

        <?php endforeach ?>
      </select>
      <button class="btn inverted" data-cpt-add-post>Add new</button>
      <input class="btn" type="submit" value="Create">
      <input class="btn" type="submit" data-delete-posts name="skip" value="delete all">
    </div>

    <div class="section-items" data-cpt-post-list>
        <div class="post-item df" data-post-fields>
          <input type="text" name="post_items[title][]" placeholder="Title">
          <input type="text" name="post_items[excerpt][]" placeholder="Excerpt">
          <button class="delete-post-item" data-delete-item title="delete">delete</button>
        </div>
    </div>

  </form>

  <h3>Copy fields</h3>

  <form class="grid-12" action="<?php echo $link ?>&step=2" method="POST">
    <div class="section-navihation">
      <label>
        <span>Field name</span>
        <input type="text" name="the_field_name" require placeholder="Field name ( pageContent etc )">
      </label>
      <label>
        <span>Maybe Field value</span>
        <input type="text" name="the_field_value" require placeholder="Field value ( Simple text or number )">
      </label>
      <label>
        <span>From post id</span>
        <input type="text" name="from_post_id" require>
      </label>
      <label>
        <span>To post id</span>
        <input type="text" name="to_post_id" require>
      </label>

      <input class="btn" type="submit" value="copy">
    </div>

  </form>

  <h3>Assign random categories</h3>

  <form class="grid-12" action="<?php echo $link ?>&step=3" method="POST">
    <div class="section-navihation">
      <select name="cpt_posts_assignment">
        <?php foreach ($post_types as $key => $post_type):
          if (in_array($key, $skip_cpts)) continue; ?>
          <option value="<?php echo $key ?>"><?php echo $post_type ?></option>
        <?php endforeach ?>
      </select>

      <select name="terms_assignment">
        <?php foreach ($taxonomies as $key => $post_type):
          if (in_array($key, $skip_cpts)) continue; ?>
          <option value="<?php echo $key ?>"><?php echo $post_type ?> (Taxonomy)</option>
        <?php endforeach ?>
      </select>

      <input class="btn" type="submit" value="assign">
    </div>

  </form>

  <h3>Assign random images</h3>

  <form class="grid-12" action="<?php echo $link ?>&step=4" method="POST">
    <div class="section-navihation">
      <select name="cpt_posts_assignment">
        <?php foreach ($post_types as $key => $post_type):
          if (in_array($key, $skip_cpts)) continue; ?>
          <option value="<?php echo $key ?>"><?php echo $post_type ?></option>
        <?php endforeach ?>
      </select>
      <input class="btn" type="submit" value="assign">
    </div>

  </form>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template) ?>
  </div>
</div>