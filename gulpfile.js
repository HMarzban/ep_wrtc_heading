const gulp = require('gulp');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify-es').default;
const mode = require('gulp-mode')();
const sourcemaps = require('gulp-sourcemaps');
const htmlmin = require('gulp-htmlmin');
const rename = require('gulp-rename');
const bump = require('gulp-bump');
const git = require('gulp-git');
const cleanCSS = require('gulp-clean-css');


const jsfiles = [
  './static/js/lib/adapter.js',
  './static/js/lib/getUserMediaPolyfill.js',
  './static/js/lib/jquery.tmpl.min.js',
  './static/js/lib/getStats.min.js',
  // './static/js/lib/components.js',
  './static/js/lib/helpers.js',
  './static/js/lib/copyPasteEvents.js',
  './static/js/lib/codecsHandler.js',
  './static/js/lib/textChat.js',
  './static/js/lib/videoChat.js',
  './static/js/lib/webrtcRoom.js',
  './static/js/lib/webrtc.js',
];

const cssFiles = ['./static/css/**/*.css']
const htmlFiles = ['./static/templates/*.html']

const gulpifyJs = function () {
  return gulp.src(jsfiles)
      .pipe(mode.production(sourcemaps.init()))
      .pipe(mode.production(uglify(/* options */)))
      .pipe(concat('wrtc.heading.mini.js'))
      .pipe(mode.production(sourcemaps.write('.')))
      .pipe(gulp.dest('static/dist/js'));
};

gulp.task('js', gulpifyJs);

gulp.task('html', () => gulp.src(htmlFiles)
    .pipe(htmlmin({collapseWhitespace: true, removeComments: true, minifyJS: true}))
    .pipe(concat('webrtcComponent.mini.html'))
		.pipe(gulp.dest('static/dist/templates')));

gulp.task('css', () => gulp.src(cssFiles)
		.pipe(cleanCSS({compatibility: 'ie8'}))
		.pipe(gulp.dest('static/dist/css')));		
		
gulp.task('bump', () => {
		return gulp.src('./package.json')
		.pipe(bump())
		.pipe(gulp.dest('./'));
	});

gulp.task('git:publish', () => gulp.src([
		'./static/dist/',
		'./package.json'
	])
	.pipe(git.add())
	.pipe(git.commit('build, version'))
);

// Run git push
// branch is the current branch & remote branch to push to
gulp.task('git:psuh', () => {
  return git.push('origin', (err) => {
    if (err) throw err;
  });
});

gulp.task('watch', () => {
  gulp.watch([...jsfiles, ...cssFiles, ...htmlFiles], gulp.series(['js','css', 'html']));
});

gulp.task('build', gulp.series(['js','css','html']));
gulp.task('build:publish', gulp.series(['js','css','html', 'bump', 'git:publish', 'git:psuh']));
