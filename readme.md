# ABOUT PROJECT BUNDLE

This bundle is created for fast WordPress site development and deployment. It uses a modern Node.js-based task runner (BBG) with RSpack and Lightning CSS to provide:

- Fast SCSS/JS compilation for different environments (development|production)
- Image optimization, compression, and WebP conversion
- TTF to WOFF2 font conversion
- Database operations (create/backup/migrate) between local, staging & production servers
- Selective deployment (full app or theme only) between environments
- Unified error handling with Windows tray notifications
- Watch mode for real-time development

# FOLDER STRUCTURE

- `/app/` - Core WordPress installation
- `/.bbg/` - BBG task runner and utilities
- `/src/` - Source files:
  - `/scss/` - SCSS stylesheets
  - `/js/` - JavaScript files
  - `/img/` - Images to optimize/convert
  - `/fonts/` - Fonts to convert
  - `/video/` - Video assets
  - `/json/` - JSON data files
  - `/templates/` - Template files

# SYSTEM REQUIREMENTS

- Local web server (OpenServer, WAMP, LAMP, etc.)
- PHP >= 8.1
- MySQL >= 8.0
- Node.js >= 22.0.0 (with npm >= 10.0.0)
- Yarn (recommended over npm)
- WP-CLI installed globally (optional, for WordPress operations)

# INSTALLATION

## 1. Setup Project

1. Clone/download repository to your projects folder and name it `{projectName}.loc`
2. Install dependencies: `yarn install` (or `npm install`)
3. Configure environment files (see Configuration section)
4. Run initial setup: `yarn create-app`
5. Restart your web server to refresh local domains

## 2. Configuration Files

### `config.json` - Project Configuration
```json
{
  "siteName": "your-site-name",
  "themeName": "your-theme-name",
  "url": {
    "local": "http://yoursite.loc",
    "staging": "https://staging.yoursite.com",
    "production": "https://yoursite.com"
  }
}
```

### Environment Files
Create `.env.{environment}` files for each environment:

#### `.env.local` (Required)
```bash
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=yoursite_local
```

#### `.env.staging` (Optional)
```bash
# Database
DB_HOST=staging-server.com
DB_USER=staging_user
DB_PASSWORD=staging_password
DB_NAME=staging_database

# SSH Connection
SSH_HOST=staging-server.com
SSH_USER=username
SSH_PASSWORD=password
# OR use SSH key:
SSH_KEYNAME=yoursite_rsa
SSH_PATH=/path/to/staging/site
SSH_SUDO=false
```

#### `.env.production` (Optional)
Similar to staging but with production credentials.

# DEVELOPMENT WORKFLOW

## Asset Compilation

### Start Development (with watch mode)
```bash
yarn start    # Compile assets and start watching for changes
# or
yarn dev      # Same as start
yarn watch    # Watch mode only
```

### Build for Production
```bash
yarn build    # Build all assets for production (minified, optimized)

# Build specific asset types:
yarn build:css    # Build CSS only
yarn build:js     # Build JavaScript only
yarn build:img    # Build images only
yarn build:fonts  # Build fonts only
```

### Individual Task Commands
```bash
# Compile specific assets in development mode:
yarn css      # Compile SCSS to CSS
yarn js       # Compile JavaScript
yarn img      # Optimize images and convert to WebP
yarn fonts    # Convert TTF fonts to WOFF2

# Clean build directory:
yarn clean    # Remove all compiled assets
```

## Available Tasks
The BBG task runner supports these tasks:
- `css` - SCSS compilation with Lightning CSS
- `js` - JavaScript bundling with RSpack
- `img` - Image optimization and WebP conversion
- `fonts` - Font conversion (TTF to WOFF2)
- `json` - JSON file processing
- `tpl` - Template processing
- `webp` - WebP conversion
- `watch` - Watch mode for development
- `build` - Production build
- `clean` - Clean compiled assets

# DEPLOYMENT & DATABASE OPERATIONS

## Database Operations
```bash
# Create database:
yarn db:create --env local

# Backup database:
yarn db:backup --from production    # Download from production
yarn db:backup --from staging       # Download from staging

# Migrate database between environments:
yarn db:migrate --to staging        # Push local DB to staging
yarn db:migrate --to production     # Push local DB to production

# Export database (with URL updates):
yarn db:export --from production --to local    # Download and update URLs
yarn db:export --from staging --to local       # Download and update URLs
```

## File Deployment
```bash
# Deploy entire application:
yarn app-to-staging        # Deploy app to staging
yarn app-to-production     # Deploy app to production

# Deploy theme only:
yarn theme-to-staging                    # Deploy theme to staging
yarn theme-to-staging:build             # Build & deploy theme to staging
yarn theme-to-production                # Deploy theme to production
yarn theme-to-production:build          # Build & deploy theme to production

# Backup files from remote:
yarn backup-theme-staging               # Download theme from staging
yarn backup-theme-production            # Download theme from production
```

## Command Options
All deployment commands support these options:
- `--debug` - Show detailed debug information
- `--compress` - Enable compression for transfers
- `--nocompress` - Disable compression
- `--ftp` - Use FTP instead of SSH (if configured)

## SSH Key Setup (Optional)
For passwordless deployments:
1. Generate SSH key: `ssh-keygen -t rsa -b 4096 -f ~/.ssh/yourproject_rsa`
2. Add public key to remote server's `~/.ssh/authorized_keys`
3. Set `SSH_KEYNAME=yourproject_rsa` in your environment file

# ERROR HANDLING

The BBG system includes comprehensive error handling:
- **Unified Notifications**: All errors show Windows tray notifications
- **Graceful Exits**: Failed tasks exit cleanly without "command failed" messages
- **Detailed Logging**: Use `--debug` flag for detailed error information
- **Smart Error Messages**: Common errors (SSH key not found, database issues) show user-friendly messages

# TROUBLESHOOTING

## Common Issues

### "SSH key file not found"
- Ensure SSH key exists in `~/.ssh/` directory
- Check `SSH_KEYNAME` setting in environment file
- Verify key permissions (600 for private key, 644 for public key)

### "Environment file does not exist"
- Create required `.env.{environment}` files
- Check file naming (`.env.local`, `.env.staging`, `.env.production`)
- Ensure files are in project root directory

### "Database connection failed"
- Verify database credentials in environment file
- Ensure database server is running
- Check network connectivity for remote databases

### "Task not found"
- Use `yarn run` to see all available scripts
- Check spelling of task names
- Some tasks require environment arguments (e.g., `--from`, `--to`)

### Assets not compiling
- Check source file paths in `config.json`
- Ensure source files exist in `/src/` directories
- Run with `--debug` flag for detailed information

## Getting Help
- Check the BBG task runner documentation in `/.bbg/`
- Use `--debug` flag for detailed error information
- Review environment file configurations


---

**BBG Task Runner** - Modern WordPress development and deployment system
Built with RSpack, Lightning CSS, and Node.js for fast, reliable workflows.