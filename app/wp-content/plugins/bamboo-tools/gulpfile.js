const gulp = require('gulp');
const sass = require('gulp-sass')(require('sass'));
const fs = require('fs-extra');
const path = require('path');
const notify = require('gulp-notify');
const archiver = require('archiver');

function getAllFiles(dir, ignorePatterns = []) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    const shouldIgnore = ignorePatterns.some((pattern) => filePath.includes(pattern));
    if (shouldIgnore) return;

    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, ignorePatterns));
    } else {
      results.push(filePath);
    }
  });

  return results;
}

function createZip() {
  const directoryPath = './';
  const ignorePatterns = ['node_modules', '.git', 'scss', 'bamboo-tools.zip', 'gulpfile.js', 'yarn.lock', 'package.json', 'readme.md'];
  const outputZipPath = './bamboo-tools.zip';
  const files = getAllFiles(directoryPath, ignorePatterns);

  const output = fs.createWriteStream(outputZipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  output.on('close', function () {
    console.log(`${archive.pointer()} total bytes`);
    console.log('ZIP file has been created successfully.');
  });

  archive.on('error', function (err) {
    throw err;
  });

  archive.pipe(output);

  files.forEach(file => {
    archive.file(file, { name: path.relative(process.cwd(), file) });
  });

  archive.finalize();
  return;
}

function compileSCSS() {
  return gulp.src('./assets/scss/**/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('./assets'))
    .pipe(notify({ message: 'SCSS compiled!', onLast: true }));
}

gulp.task('build', async () => {
  compileSCSS();
  createZip();
});

gulp.task('watch', () => {
  gulp.watch('./assets/scss/**/*.scss', compileSCSS);
});

gulp.task('archive', async () => {
  createZip();
});

gulp.task('default', () => {
  compileSCSS();
  gulp.watch('./assets/scss/**/*.scss', compileSCSS);
});