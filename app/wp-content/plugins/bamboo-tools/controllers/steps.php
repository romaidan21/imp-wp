<?php

if (!defined('ABSPATH')) exit;

class Steps
{

  public static function doActionTool($step, $template)
  {

    switch ($template) {
      case 'mail':
        self::doMail($step);
        break;
      case 'database':
        self::doDatabase($step);
        break;
      case 'phpinfo':
        self::doPhpInfo($step);
        break;
      case 'users':
        self::doUsers($step);
        break;
      case 'cpt':
        self::doCpt($step);
        break;
      case 'api':
        self::doApi($step);
        break;
      case 'wpml':
        self::doWpml($step);
        break;

      default:
        break;
    }
  }

  public static function doMail($step)
  {
    $to = !empty($_POST['mail_input']) ? $_POST['mail_input'] : 'dev@bambus.com.ua';
    $type = !empty($_POST['type']) ? $_POST['type'] : 'wp_mail';

    if (!is_email($to)) {
      echo_p("The email $to incorrect!");
      return;
    }

    if ($step == 1 && $type == 'wp_mail') {

      $subject = 'Test Email from WordPress';
      $message = !empty($_POST['body_input'])
        ? $_POST['body_input']
        : 'This is a test email sent';

      $headers = array('Content-Type: text/html; charset=UTF-8');

      if (wp_mail($to, $subject, $message, $headers)) {
        echo_p("Test email sent successfully to $to ! ");
      } else {
        echo_p('Failed to send test email.');
      }
    }

    if ($step == 1 && $type == 'php_mail') {
      $subject = 'Test Email from PHP';
      $message = !empty($_POST['body_input'])
        ? $_POST['body_input']
        : 'This is a test email sent';

      $domain = parse_url(get_site_url(), PHP_URL_HOST);

      $headers = 'From: WordPress <wordpress@' . $domain . '>' . "\r\n" .
        'Reply-To: wordpress@' . $domain . '' . "\r\n" .
        'X-Mailer: PHP/' . phpversion();

      if (mail($to, $subject, $message, $headers)) {
        echo_p("Test email sent successfully to $to ! ");
      } else {
        echo_p('Failed to send test email.');
        $error = error_get_last();
        echo_p('Error details: ' . print_r($error, true) . '');
      }
    }

    if ($step == 1 && $type == 'sendmail_version') {
    }
  }

  public static function doDatabase($step)
  {
    if ($step == 1) {
      try {
        if (
          !defined('DB_NAME') ||
          !defined('DB_USER') ||
          !defined('DB_PASSWORD') ||
          !defined('DB_HOST')
        ) {
          return;
        }

        $host = DB_HOST;
        $user = DB_USER;
        $pass = DB_PASSWORD;
        $db_name = DB_NAME;
        $name = 'dumpbcp.sql';
        $backup_file = get_template_directory() . "/$name";

        $command = "mysqldump --disable-keys --no-tablespaces --hex-blob --user=$user --password=$pass --host=$host  $db_name > $backup_file";

        system($command, $result);

        if ($result == 0) {
          echo_p("Database backup created successfully");

          echo_p("Please remove the backup file after downloading!");
        } else {
          echo_p("Database backup failed");
        }
      } catch (\Throwable $th) {
        echo_p('Fatall error');
      }
    }

    if ($step == 2) {
      $name = 'dumpbcp.sql';
      $backup_file = get_template_directory() . "/$name";
      if (file_exists($backup_file)) {
        if (unlink($backup_file)) {
          echo_p("The file $backup_file has been deleted successfully.");
        } else {
          echo_p("Error: Could not delete the file $backup_file.");
        }
      } else {
        echo_p("Error: The file $backup_file does not exist.");
      }
    }
  }

  public static function doPhpInfo($step)
  {
    if ($step == 1) {
      phpinfo();
    }
  }

  public static function doUsers($step)
  {
    if ($step == 1) {
      if (!empty($_POST['user_id']) && !empty($_POST['user_nickname'])) {

        $user_id = (int)$_POST['user_id'];
        $new_username = $_POST['user_nickname'];

        $user = get_userdata($user_id);

        if (!$user) {
          echo "User not found.";
          return;
        }

        global $wpdb;
        $is_updated = $wpdb->update($wpdb->users, array('user_login' => $new_username), array('ID' => $user_id));

        if (is_wp_error($user_id)) {
          echo_p("ERROR: " . $is_updated->get_error_message());
        } else {
          if (empty($user_id)) {
            echo_p('ERROR');
            return;
          }
          echo_p("Username successfully updated to: <b>$new_username</b>.");
        }
      }
    }
  }

  public static function doCpt($step)
  {
    $cpt = $_POST['cpt'] ?? '';

    if ($step == 1 && !empty($cpt)) {
      if (!empty($_POST['skip'])) return;

      if (!empty($_POST['delete_all'])) {

        if (post_type_exists($cpt)) {

          $args = array(
            'post_type' => $cpt,
            'post_status' => 'any',
            'posts_per_page' => -1,
            'fields' => 'ids'
          );
          // TODO: @v -add multilang
          // $posts = BambooPosts::getAllLangPosts($args);
          $posts = get_posts($args);

          if (!empty($posts)) {
            foreach ($posts as $post_id) {
              wp_delete_post($post_id, true);
            }

            echo_p("All posts \"$cpt\" deleted");
          } else {
            echo_p("posts not found");
          }

          return;
        }

        if (taxonomy_exists($cpt)) {
          $args = array(
            'taxonomy' => $cpt,
            'hide_empty' => false,
            'fields' => 'ids',
          );
          // TODO: @v -add multilang
          // $terms = BambooPosts::getAllLangTerms($args);
          $terms = get_terms($args);

          if (!empty($terms) && !is_wp_error($terms)) {
            foreach ($terms as $term) {
              wp_delete_term($term, $cpt);
            }

            echo_p("All terms \"$cpt\" deleted");
          } else {
            echo_p("terms not found");
          }

          return;
        }
      }

      $post_items = $_POST['post_items'] ?? [];

      if (!empty($post_items['title']) && !empty($cpt)) {
        for ($i = 0; $i < count($post_items['title']); $i++) {
          if (empty($post_items['title'][$i])) continue;

          wp_insert_post([
            'post_type' => $cpt,
            'post_status' => 'publish',
            'post_title' => $post_items['title'][$i],
            'post_excerpt' => $post_items['excerpt'][$i] ?? '',
          ]);
        }
        echo_p("posts successfully created");
      }
    }

    if ($step == 2 && !empty($_POST['from_post_id']) && !empty($_POST['to_post_id']) && !empty($_POST['the_field_name'])) {
      $field_name = $_POST['the_field_name'] ?? '';
      $from_post = get_field($field_name, $_POST['from_post_id']);
      if(!empty($_POST['the_field_value'])){
        $from_post = $_POST['the_field_value'];
      }
      $to_post = update_field($field_name, $from_post, $_POST['to_post_id']);

      if ($to_post) {
        echo_p('Success!');
      }
    }

    if ($step == 3 && !empty($_POST['cpt_posts_assignment']) && !empty($_POST['terms_assignment'])) {
      $cpt_posts_assignment = $_POST['cpt_posts_assignment'];
      $terms_assignment = $_POST['terms_assignment'];

      if (post_type_exists($cpt_posts_assignment) && taxonomy_exists($terms_assignment)) {
        $terms = get_terms(array(
          'taxonomy' => $terms_assignment,
          'hide_empty' => false,
          'fields' => 'ids',
        ));

        $posts = get_posts(array(
          'post_type' => $cpt_posts_assignment,
          'post_status' => 'publish',
          'posts_per_page' => -1,
          'fields' => 'ids'
        ));

        if(!empty($terms) && !is_wp_error($terms) && !empty($posts)) {
          $count = count($terms) -1;
          foreach ($posts as $post_id) {
            wp_set_object_terms($post_id, $terms[wp_rand(0, $count)], $terms_assignment, false);
          }
          echo_p("Terms successfully assigned to posts");
        } else {
          echo_p("No terms or posts found for assignment");
        }
      } 
    }

    if ($step == 4 && !empty($_POST['cpt_posts_assignment'])) {
      $cpt_posts_assignment = $_POST['cpt_posts_assignment'];

      if (post_type_exists($cpt_posts_assignment)) {
        $posts = get_posts(array(
          'post_type' => $cpt_posts_assignment,
          'post_status' => 'publish',
          'posts_per_page' => -1,
          'fields' => 'ids'
        ));

        if(!empty($posts)) {
          $images_ids = get_posts(array(
              'post_type' => 'attachment',
              'post_mime_type' => array(
                  'image/jpeg',
                  'image/png',
                  'image/webp',
              ),
              'post_status' => 'inherit',
              'posts_per_page' => -1,
              'fields' => 'ids',
          ));
          $count = count($images_ids) -1;

          foreach ($posts as $post_id) {
            set_post_thumbnail($post_id, $images_ids[wp_rand(0, $count)]);
          }
          echo_p("Terms successfully assigned to posts");
        } else {
          echo_p("No terms or posts found for assignment");
        }
      } 
    }
  }

  public static function doApi($step)
  {
    if ($step == 1 && !empty($_POST['api_url'])) {
      $response = wp_remote_get($_POST['api_url']);

      if (is_wp_error($response)) {
        $error_message = $response->get_error_message();
        echo_p($error_message);
      } else {
        $body = wp_remote_retrieve_body($response);
        echo '<pre>';
        print_r(json_decode($body));
        echo '</pre>';
      }
    }
  }
  public static function doWpml($step)
  {
    if ($step == 1 && !empty($_POST['acfml'])) {
      $dir = get_template_directory() . '/acf-json/';
      if (!is_dir($dir) || !is_readable($dir) || !is_writable($dir)) return false;

      $files = glob($dir . '/*.json');
      if (empty($files)) return false;

      $fields = [];

      foreach ($files as $file) {
        $json = file_get_contents($file);
        if ($json) {
          $fields_array = json_decode($json, true);
          if ($fields_array && is_array($fields_array)) {
            $fields[$file] = $fields_array;
          }
        }
      }

      $acfml = acf_force_wpml_preferences($fields);
      if ($acfml) {
        foreach ($acfml as $file_path => $field) {
          $json = acf_json_encode($field);
          if ($json) {
            file_put_contents($file_path, $json);
          }
        }
        echo_p('Success!');
      } else {
        echo_p('Error: No acfml fields found');
      }
    }


    if ($step == 2 && !empty($_POST['copy_options'])) {
      $copy_options = acf_copy_once_options_page_fields();
      if($copy_options){
        echo_p('Success!');
      } else {
        echo_p('Error: No fields found');
      }
    }
  }
}

