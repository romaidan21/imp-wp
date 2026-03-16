<?php if (!defined('ABSPATH')) exit;
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$link = site_url() . '/wp-admin/admin.php?page=bb-tools&template=mail';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'mail' && $step ? true : false;
?>

<div class="tab-container mail">
  <h2>Email tools</h2>

  <div class="tools-links" data-mail-tools>
    <form class="df fd-c" action="<?php echo $link ?>&step=1" method="POST">
    <p>
        <span>Type:</span>
        <select name="type">
          <option value="wp_mail">wp_mail()</option>
          <option value="php_mail">php mail()</option>
        </select>
      </p>

      <p>
        <span>To:</span>
        <input type="email" autocomplete="username" name="mail_input" value="" placeholder="dev@bambus.com.ua">
      </p>
      <p>
        <span>Body:</span>
        <textarea name="body_input" rows="4" cols="70" placeholder="This is a test email sents"></textarea>
      </p>

      <input class="btn" type="submit" value="Send">
    </form>
  </div>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template) ?>
  </div>
</div>