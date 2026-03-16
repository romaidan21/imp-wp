<?php if (!defined('ABSPATH')) exit;

class PandaAjaxPosts
{
  public function __construct()
  {
    add_action('wp_ajax_getPostsByCpt', [$this, 'getPostsByCpt']);
    add_action('wp_ajax_updateFieldsPost', [$this, 'updateFieldsPost']);
  }

  static public function getPostsByCpt()
  {
    global $attachment_copy_data;
    $attachment_copy_data = [];

    add_filter(
      'acf/format_value/type=image',
      function ($value, $post_id, $attachment) {
        global $attachment_copy_data;

        $url = wp_get_attachment_url($value);
        $path = get_attached_file($value);
        $content = file_get_contents($path);
        
        $attachment_copy_data[$value] = [
           'id' => $value,
           'content' => base64_encode($content),
           'url' => $url,
        ];

        return $value;
      }, 10, 3
    );
    $post_fields = get_field('pageContent', $_POST['post_id'] ?? '');
    $data = ['fields' => $post_fields, 'attachment' => $attachment_copy_data];

    $jsonData = json_encode($data);
    
    $base64Data = base64_encode($jsonData);

    
    return !empty($post_fields)
      ? wp_send_json_success($base64Data)
      : wp_send_json_error();
  }

  static public function updateFieldsPost()
  {
    $fields = $_POST['post_fields_update'] ?? '';
    $data = base64_decode($fields);

    // $data = gzuncompress($data);

    $clean_json = stripslashes($data);
    $fields_array = json_decode($clean_json, true);

    foreach($fields_array['attachment'] as &$img){
      $img['content'] = base64_decode($img['content']);
    }

    return !empty($fields_array)
      ? wp_send_json_success(['status' => 'success'])
      : wp_send_json_error();
  }
}

new PandaAjaxPosts;


add_action('admin_footer-post.php', 'add_custom_button_near_update_button');

function add_custom_button_near_update_button()
{ ?>
  <script type="text/javascript">
    document.addEventListener('DOMContentLoaded', function() {
      const postId = document.getElementById('post_ID').value;

      function addCustomButton() {
        const copyButton = document.querySelector('[data-copy-fields-button]');

        copyButton && copyButton.addEventListener('click', function(e) {

          fetch(ajaxurl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
              },
              body: new URLSearchParams({
                action: 'getPostsByCpt',
                post_id: postId
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                copyLink(data.data);

              } else {
                console.log(data);
              }
            })
            .catch(error => {
              console.log('Request failed: ' + error);
            });
        });
      }

      function updadePostFields() {
        const updateButton = document.querySelector('[data-update-fields-button]');

        updateButton && updateButton.addEventListener('click', function(e) {
          
          const updateFields = document.querySelector('[data-post-fields-update]');
          const updateData = updateFields ? updateFields.value : '';
          fetch(ajaxurl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;application/json; charset=UTF-8'
              },
              body: new URLSearchParams({
                action: 'updateFieldsPost',
                post_fields_update: updateData
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert(666)

              } else {
                console.log(data);
              }
            })
            .catch(error => {
              console.log('Request failed: ' + error);
            });
        });
      }

      function copyLink(data) {
        data = JSON.stringify(data);
        console.log(data);
        if (navigator.clipboard) {

          navigator.clipboard.writeText(data)
            .then(() => {
              alert('Copied');
            })
            .catch(err => {
              console.error('Error in copying text: ', err);
            });
        } else {
          const textArea = document.createElement('textarea');
          textArea.style.position = 'absolute';
          textArea.style.left = '-9999px';
          textArea.value = data;
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            alert('Copied');
          } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
          }
          document.body.removeChild(textArea);
        }
      }
      addCustomButton();
      updadePostFields();
    });
  </script>
<?php
}

// add_action('dbx_post_sidebar', function ($post) {
//   echo '<div data-copy-fields-button class="button button-primary">COPY FIELDS</div>';
//   echo '<div data-update-fields-button class="button button-primary">Update fields</div>';
//   echo '<textarea data-post-fields-update name="post_fields_update" rows="1" cols="50"></textarea>';
//   echo '';
// });


