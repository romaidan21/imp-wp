<!DOCTYPE html>
<html <?php language_attributes(); ?>>

<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no">
  <?php wp_head(); ?>
  <!-- startFontsPreload -->
  <link rel="preload" as="font" type="font/woff2" href="<?php assets('fonts/Montserrat-Variable.woff2'); ?>" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="<?php assets('fonts/Roboto-400.woff2'); ?>" crossorigin>
  <!-- endFontsPreload -->

  <style>
    .preloader {
      position: fixed;
      inset: 0;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 22;
    }

    .preloader svg {
      width: clamp(140px, 14.583vw, 280px);
      height: auto;
      position: absolute;
      opacity: 0;
    }
  </style>
</head>

<body <?php body_class(); ?>>
  <?php renderLayout('header'); ?>
  <main>