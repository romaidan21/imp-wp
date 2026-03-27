<?php
$menu = wp_nav_menu([
  'theme_location' => "footer_menu",
  'container'      => null,
  'items_wrap'     => '<ul class="pages" data-item>%3$s</ul>',
  'echo'           => false,
  'fallback_cb'    => null,
  'depth'          => 2
]);


$args = get_field('footer', 'options');


$popups = [
  'popup-messages',
]
?>


<footer class="footer">
  <div class="container" data-stagger='fadeup'>
    <div class="grid">
      <div class="brand flex-v" data-item>
        <div class="logo fit-cover">
          <?php echo wp_get_attachment_image($args['logo'] ?? '', 'full', false, ['loading' => 'lazy',]) ?>
        </div>
        <p class="brand-description"><?php echo esc_html($args['text'] ?? ''); ?></p>
        <?php renderComponent('socials', $args); ?>
      </div>

      <?php echo $menu; ?>


      <div class="column" data-item>
        <h4 class="column-title">Контакти</h4>
        <div class="list flex-v">
          <div class="row">
            <div class="icon location"></div>
            <div class="data">
              <p>
                <?php echo $args['address'] ?? ''; ?>
              </p>
            </div>

          </div>

          <?php if (!empty($args['phones'])) : ?>
            <div class="row">
              <div class="icon phone"></div>
              <div class="data">
                <?php foreach ($args['phones'] as $phone) : ?>
                  <a href="tel:<?php echo esc_attr($phone['phone_number']); ?>"><?php echo esc_html($phone['phone_number']); ?></a>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endif; ?>

          <?php if (!empty($args['emails'])) : ?>
            <div class="row">
              <div class="icon email"></div>
              <div class="data">
                <?php foreach ($args['emails'] as $email) : ?>
                  <a href="mailto:<?php echo esc_attr($email['email_address']); ?>"><?php echo esc_html($email['email_address']); ?></a>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endif; ?>
        </div>
      </div>
    </div>

    <div class="сopyright mt-lg">
      <p data-fade='up'>© <?php echo date("Y"); ?> <?php bloginfo('name'); ?></p>
    </div>
  </div>
</footer>

<?php
foreach ($popups as $popup) {
  renderComponent($popup);
}
?>