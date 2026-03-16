<?php if (!defined('ABSPATH')) exit;
$step = !empty($_GET['step']) ? $_GET['step'] : '';
$link = site_url() . '/wp-admin/admin.php?page=bb-tools&template=users';
$template = !empty($_GET['template']) ? $_GET['template'] : '';
$current = $template == 'users' && $step ? true : false;
$users = get_users();
if(!$users) return;

?>

<div class="tab-container">
  <h2>Users tools</h2>
  <h3>Change username :</h3>

  <form action="<?php echo $link ?>&step=1" method="POST">
      <select name="user_id">
          <?php foreach($users as $user):
              if(empty($user->ID) || empty($user->data->user_login)) continue; ?>
              <option value="<?php echo $user->ID ?>"><?php echo $user->data->user_login ?></option>
          <?php endforeach ?>
      </select>

      <input type="text" name="user_nickname" placeholder="New username">
      <input class="btn" type="submit" value="Update">
  </form>

  <div class="result">
    <?php $current && Steps::doActionTool($step, $template) ?>
  </div>
</div>