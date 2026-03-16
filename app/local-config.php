<?php

// Suppress PHP 8.1+ deprecation warnings early for WordPress core compatibility
if (strpos($_SERVER['HTTP_HOST'] ?? '', '.loc') !== false) {
    error_reporting(E_ALL & ~E_DEPRECATED);
    ini_set('error_reporting', E_ALL & ~E_DEPRECATED);
}

function getEnvironment(): string
{
    if (!isset($_SERVER['HTTP_HOST'])) return 'local';

    $host = $_SERVER['HTTP_HOST'];

    if (str_ends_with($host, '.loc')) {
        return 'local';
    } elseif (str_contains($host, 'bambus.com.ua')) {
        return 'staging';
    }

    return 'production';
}

// Load environment variables
function loadEnv(string $environment): bool
{
    if ($environment === 'local') {
        // Local: use .env.local from project root
        $filePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env.local';
    } else {
        // Staging/Production: use .env from app directory
        $filePath = __DIR__ . DIRECTORY_SEPARATOR . '.env';
    }

    if (!file_exists($filePath) || !is_readable($filePath)) {
        throw new RuntimeException("Environment file not found or not readable at path: {$filePath}");
    }

    return parseEnvFile($filePath);
}

// Custom .env file parser
function parseEnvFile(string $filePath): bool
{
    $content = file_get_contents($filePath);
    if ($content === false) return false;

    // Remove BOM if present
    $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);

    $lines = explode("\n", $content);

    foreach ($lines as $line) {
        $line = trim($line);

        // Skip comments and empty lines
        if (empty($line) || $line[0] === '#') {
            continue;
        }

        // Find the equals sign
        $equalsPos = strpos($line, '=');
        if ($equalsPos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $equalsPos));
        $value = trim(substr($line, $equalsPos + 1));

        // Skip if key is empty
        if (empty($key)) {
            continue;
        }

        // Remove surrounding quotes if present
        if (strlen($value) >= 2) {
            $firstChar = $value[0];
            $lastChar = $value[-1];
            if (($firstChar === '"' && $lastChar === '"') ||
                ($firstChar === "'" && $lastChar === "'")
            ) {
                $value = substr($value, 1, -1);
            }
        }

        // Handle basic escape sequences in double quotes
        if (strpos($value, '\\') !== false) {
            $value = str_replace(
                ['\\n', '\\r', '\\t', '\\"', "\\'", '\\\\'],
                ["\n", "\r", "\t", '"', "'", '\\'],
                $value
            );
        }

        // Set environment variable
        $_ENV[$key] = $value;
        putenv("$key=$value");
    }

    return true;
}

// Configure system based on environment
function setupConfig(string $environment): void
{
    switch ($environment) {
        case 'local':
            define('WP_ENVIRONMENT_TYPE', 'local');
            define('WP_DEBUG', true);
            define('WP_DEBUG_DISPLAY', false); // Don't show errors on screen
            define('WP_DEBUG_LOG', true);      // Log errors to file instead

            // Suppress all deprecation warnings completely for local development
            ini_set('error_reporting', E_ALL & ~E_DEPRECATED);
            error_reporting(E_ALL & ~E_DEPRECATED);

            file_exists('../../.vscode/debug.php') && require_once '../../.vscode/debug.php';
            break;
        case 'staging':
            define('WP_ENVIRONMENT_TYPE', 'staging');
            define('WP_DEBUG', true);
            define('WP_DEBUG_DISPLAY', false);
            define('WP_DEBUG_LOG', true);
            break;
        default:
            define('WP_ENVIRONMENT_TYPE', 'production');
            define('WP_DEBUG', false);
            break;
    }

    // DB Configuration
    define('DB_NAME', $_ENV['DB_NAME'] ?? '');
    define('DB_USER', $_ENV['DB_USER'] ?? '');
    define('DB_PASSWORD', $_ENV['DB_PASSWORD'] ?? '');
    define('DB_HOST', $_ENV['DB_HOST'] ?? 'localhost');

    // More system configurations...
    define('WP_MEMORY_LIMIT', ini_get('memory_limit'));
    define('CONCATENATE_SCRIPTS', false);
    define('WP_DEFAULT_THEME', 'bamboo');
    define('CORE_UPGRADE_SKIP_NEW_BUNDLED', true);
    define('DISALLOW_FILE_EDIT', true);
    define('WP_POST_REVISIONS', false);
    define('ACF_PRO_LICENSE', 'b3JkZXJfaWQ9MTM3MTM4fHR5cGU9ZGV2ZWxvcGVyfGRhdGU9MjAxOC0wOC0xMyAxMjowNTo0Mw==');
}

// Main Execution
$environment = getEnvironment();
$envLoaded = loadEnv($environment);

if (!$envLoaded) {
    throw new RuntimeException("Failed to load environment variables");
}

setupConfig($environment);
