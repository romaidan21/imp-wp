<?php if (!defined('ABSPATH')) exit;
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$link = site_url() . '/wp-admin/admin.php?page=bb-tools&template=wpml';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'wpml' && $step ? true : false;
// do_action('admin_notices');
?>

<div class="tab-container">
  <h2>Wpml tools</h2>

  <form action="<?php echo $link ?>&step=1" method="POST">
    <span>Make all acf fields as `Copy Once`</span>
    <br>
    <span>1. Click `Do acfml configuration` </span>
    <br>
    <span>2. Sync acf changes </span>
    <input type="hidden" name="acfml" value="acfml">
    <input class="btn" type="submit" value="Do acfml configuration">
  </form>

  <form action="<?php echo $link ?>&step=2" method="POST">
    <span>Copy all options pages for all laguages</span>
    <input type="hidden" name="copy_options" value="copy_options">
    <input class="btn" type="submit" value="Copy options pages">
  </form>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template) ?>
  </div>
</div>