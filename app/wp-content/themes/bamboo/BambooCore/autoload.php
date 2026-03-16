<?php
spl_autoload_register(function ($namespace) {
    try {
        // Only handle BambooCore namespace
        if (strpos($namespace, 'BambooCore\\') === 0) {
            // Convert namespace to file path
            $file = get_template_directory() . '/' . str_replace('\\', '/', $namespace) . '.php';
            $normalizedFile = wp_normalize_path($file);
            
            if (file_exists($normalizedFile)) {
                require_once $normalizedFile;
            }
        }
    } catch (\Exception $e) {
        // Log error instead of echoing to avoid breaking the page
        error_log('BambooCore Autoloader Error: ' . $e->getMessage());
    }
});