<?php if (!defined('ABSPATH')) exit;
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$link = site_url() . '/wp-admin/admin.php?page=bb-tools&template=phpinfo';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'phpinfo' && $step ? true : false;
?>

<div class="tab-container">
  <h2>Email tools</h2>

  <div class="tools-links">
    <a href="<?php echo $link ?>&step=1">PHP info</a>
  </div>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template) ?>
  </div>
</div>