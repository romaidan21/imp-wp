<?php if (!defined('ABSPATH')) exit; 
$link = site_url().'/wp-admin/admin.php?page=bb-tools&template=database';
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'database' ? true : false;

?>

<div class="tab-container">
  <h2>Database tools</h2>

  <div class="tools-links">
    <a href="<?php echo $link ?>&step=1">BACKUP</a>
  </div>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template);
      $backup_file_url = file_exists(get_template_directory() . "/dumpbcp.sql")
        ? true
        : false ;

      if($backup_file_url): ?>
      <a href="<?php echo get_template_directory_uri() . "/dumpbcp.sql" ?>" download>Download DUMP</a>
      <a class="btn" href="<?php echo $link ?>&step=2">REMOVE BACKUP FILE</a>
    <?php endif ?>
  </div>
</div>