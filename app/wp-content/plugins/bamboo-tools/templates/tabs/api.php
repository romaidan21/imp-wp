<?php if (!defined('ABSPATH')) exit;
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$link = site_url() . '/wp-admin/admin.php?page=bb-tools&template=api';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'api' && $step ? true : false;
?>

<div class="tab-container">
  <h2>APi tools</h2>

  <form action="<?php echo $link ?>&step=1" method="POST">
      <input type="text" name="api_url" placeholder="Url">
      <input class="btn" type="submit" value="Parse">
  </form>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template) ?>
  </div>
</div>