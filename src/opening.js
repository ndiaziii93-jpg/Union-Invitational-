/* The opening, run before anything else in the book.
 *
 * This file is not part of the bundle. It is inlined near the top of the
 * page, in its own small script, immediately after the crest's own data —
 * and that placement is the entire point of it.
 *
 * The crest used to be put up by the book itself, which meant waiting for
 * two and a half megabytes of hole diagrams to parse, then for the bundle,
 * then for the store to be built, and only THEN starting a third of a
 * second's grace before anything appeared. On a phone that is a second or
 * more of blank paper before the flourish that is supposed to be covering
 * the wait. The crest was arriving after the very silence it exists to fill.
 *
 * So it goes up here instead, in a script of a couple of hundred kilobytes
 * rather than three megabytes, which is as close to the first paint as the
 * page can get. Nothing before it, nothing to wait for.
 *
 * Everything the opening does is timed from this moment, by clock rather
 * than by how the loading happens to go, because the whole complaint about
 * the old one was that no two openings looked alike.
 */
(function () {
  var HOLD = 1800;      // the crest, whole and solid, asked for by name
  var FADE = 1500;      // and the way back out to being a watermark

  var app = document.getElementById('app');
  var host = document.body || document.documentElement;
  if (!host || !window.UI_CREST) return;

  var wm = document.createElement('div');
  wm.className = 'watermark opening';
  wm.setAttribute('aria-hidden', 'true');
  wm.style.backgroundImage = 'url("' + window.UI_CREST + '")';
  host.appendChild(wm);

  /* The book is held back, and it is held back BY A CLASS, never by a
     stylesheet. A rule that hid it would leave a blank page for ever if any
     of this failed to run; a class can only be added by the code that also
     takes it away, and the taking away is already booked on the next line. */
  if (app) app.classList.add('behind');

  setTimeout(function () {
    if (app) { app.classList.remove('behind'); app.classList.add('arrived'); }
  }, HOLD);

  /* And the crest goes back to being the watermark it always was. The class
     only carries the opening; removing it leaves the resting style, which is
     where the animation ends anyway, so nothing moves when it goes. */
  setTimeout(function () { wm.classList.remove('opening'); }, HOLD + FADE + 200);
})();
