/* EVERY COACH ON VIDEO, STILL THERE. Asks YouTube's oEmbed endpoint about
   each drill's link: 200 with a title is public; 401 or 403 is private or
   not embeddable; 404 is gone. Run it from a machine that can reach
   YouTube (this needs no key): node tools/videos-check.mjs
   A failure prints the drill, so the link can be replaced in src/drills.js. */
const { DRILLS, VIDEOS_CHECKED } = await import('../src/drills.js');
let bad = 0;
console.log('links last checked ' + VIDEOS_CHECKED + '; checking ' + DRILLS.length + ' now\n');
for (const d of DRILLS) {
  const url = d.video && d.video.url;
  let line;
  try {
    const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json', { signal: AbortSignal.timeout(15000) });
    if (r.ok) { const j = await r.json(); line = '  OK    ' + d.id.padEnd(13) + (j.author_name || '?') + ' · ' + (j.title || '?'); }
    else { bad++; line = '  BAD   ' + d.id.padEnd(13) + r.status + (r.status === 404 ? ' gone' : ' private or not embeddable') + '  ' + url; }
  } catch (e) { bad++; line = '  ???   ' + d.id.padEnd(13) + 'could not ask YouTube: ' + (e && e.message || e); }
  console.log(line);
}
console.log(bad ? '\n' + bad + ' to replace in src/drills.js' : '\nall ' + DRILLS.length + ' reachable');
process.exit(bad ? 1 : 0);
