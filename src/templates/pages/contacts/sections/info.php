<?php

$args = get_field('footer', 'options');

?>

<section class="contacts">

  <div class="container">

    <div class="contacts__grid">


      <div class="contacts__info-column" data-stagger='fadeup'>
        <h2 class="contacts__info-title font-48" data-item>Наші Контакти</h2>
        <div class="list flex-v">
          <div class="row" data-item>
            <div class="icon location"></div>
            <div class="data">
              <p><?php echo $args['address'] ?? ''; ?></p>
            </div>

          </div>


          <?php if (!empty($args['phones'])) : ?>
            <div class="row" data-item>
              <div class="icon phone"></div>
              <div class="data">
                <?php foreach ($args['phones'] as $phone) : ?>
                  <a href="tel:<?php echo esc_attr($phone['phone_number']); ?>"><?php echo esc_html($phone['phone_number']); ?></a>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endif; ?>

          <?php if (!empty($args['emails'])) : ?>
            <div class="row" data-item>
              <div class="icon email"></div>
              <div class="data">
                <?php foreach ($args['emails'] as $email) : ?>
                  <a href="mailto:<?php echo esc_attr($email['email_address']); ?>"><?php echo esc_html($email['email_address']); ?></a>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endif; ?>

          <div data-item>
            <?php renderComponent('socials', $args); ?>
          </div>

        </div>
      </div>

      <div class="form-card" data-fade='up'>
        <?php echo do_shortcode('[contact-form-7 id="01eca0d"]') ?>
      </div>
    </div>


    <div class="map mt-lg fit-cover" data-fade='up'>
      <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2573.6704334219244!2d24.028835843072077!3d49.82985909524421!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x473add672427f8df%3A0x95752e4ba5bbc566!2z0LLRg9C70LjRhtGPINCG0LLQsNC90LAg0KTRgNCw0L3QutCwLCA3NCwg0JvRjNCy0ZbQsiwg0JvRjNCy0ZbQstGB0YzQutCwINC-0LHQu9Cw0YHRgtGMLCA3OTAwMA!5e0!3m2!1suk!2sua!4v1647596716902!5m2!1suk!2sua" width="645" height="920" style="border:0;" allowfullscreen="" loading="lazy"></iframe>
    </div>

  </div>
</section>