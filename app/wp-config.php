<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the web site, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * Localized language
 * * ABSPATH
 *
 * @link https://wordpress.org/support/article/editing-wp-config-php/
 *
 * @package WordPress
 */

// Include local configuration
if (file_exists(dirname(__FILE__) . '/local-config.php')) {
	include(dirname(__FILE__) . '/local-config.php');
}

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',          'd6ezB6CVm$oAa|U-~8_yqr+4^kon#zxa0y:L>H|j}*fu!9U&>|:;Ps#a(^{2!E;w' );
define( 'SECURE_AUTH_KEY',   '}|<VYqoq0BvI|c<[dk~!QB[^G7_P`xWHKp&GY:<$oV+6Q&d#+.D{G9H>EO`4F#U/' );
define( 'LOGGED_IN_KEY',     '^#X1(w-#0X[HrY:wdw+1[mL=l$g+_5tSn|cd$=FNWe)%_L*/CqooS#W<_VkN*T<+' );
define( 'NONCE_KEY',         'qsecVV1DjIPR2_jzRF9x^UJyPs5Z)+3U3GA-QP@l(wF[)+%F.&l&iMa*:uHQ+lQR' );
define( 'AUTH_SALT',         '4Fy{5HVx1{tPI?B:$&~x+3oKP;<KvMXt=,uD77-!^X3)5jwc0OOp3LNk1pS{$J=U' );
define( 'SECURE_AUTH_SALT',  '9g35$>GmdrgQ/E7WNFhcNX1OvwO$Z7RfBT{PA&f=XCgEpNQZyhCdG+L&HX~wwDiu' );
define( 'LOGGED_IN_SALT',    '#,(4h3a}ZIJ,FK9OLuq$40Q(uqlmM[kBYstjp~:.#ZGcMvM)mAPj]:g!aj+qJY<V' );
define( 'NONCE_SALT',        'W)OU]OwS7+O#H_H_sPHH6wG=7m#L-qYYyGjbrDG;<#NAb/$?l?qtKyBU-DX,3VFf' );
define( 'WP_CACHE_KEY_SALT', '|?YISQWnO!m-A&#N,/V8^,ESwZYL=(3/OfLmJok8.z+{bX+6)]Q;C})LTLIOL i*' );


/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'bb_';


/* Add any custom values between this line and the "stop editing" line. */



/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://wordpress.org/support/article/debugging-in-wordpress/
 */
if ( ! defined( 'WP_DEBUG' ) ) {
	define( 'WP_DEBUG', false );
}

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
