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
define( 'AUTH_KEY',          'B] =y?h4}fXE *dU#?WozAMzJ^(o/q2:U=vCS*NXi56|Lbo.[u9d%K8TL:xsm+v[' );
define( 'SECURE_AUTH_KEY',   '].l~Ie8)OTKK1B,ld+3+_/X^u[46%ul- j@1ty-(;!jNycyM$RjOBPB~Hi48.r_/' );
define( 'LOGGED_IN_KEY',     ')m@5`t8[J/QY@HV2)?fpb|V,zBunN*o?})pxv3}4@9sdzh;Mu0r)G$a(Hiu>g?q}' );
define( 'NONCE_KEY',         'a&L)ak{&pHH*xP=HbOh1i=AzosH]]LU!70+Yj5{Y*nwJ-:|bQyxPzRY xc&IF{yt' );
define( 'AUTH_SALT',         'jOo<s!6SdYJ(MRAu>jk :|ABI;.`aztDnu`$-oD[G;bltOg80RcmLL63P.^Xn^NH' );
define( 'SECURE_AUTH_SALT',  'L>P.srXwV,n`|.4rOgyxyxUB^IS~W?`moZSqjKSb_|{klWv$ldY(mq*5k[).ZeDX' );
define( 'LOGGED_IN_SALT',    'F]70mvsj+.fk3173G^c?eM=Hgb9UK9$,/$3_EVIkK)poAg:}$[iOq5@P2iy+5WU]' );
define( 'NONCE_SALT',        'C+J=cPX~ HM;G7t8.8ZPB^ox|EZ02$,cm%?V}Jr7AnrXrh?3KrCB&^zFT:s*^mKM' );
define( 'WP_CACHE_KEY_SALT', ']@(zMm1$(Fpa!=&&9h&ZB$>1f8SO:?`|)}7Y,[By{|n+NG3_j]j{xSfuW<X!)qFH' );


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
