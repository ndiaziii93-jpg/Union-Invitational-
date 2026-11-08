/* The Union Invitational — the drawings in the practice manual.
 *
 * One drawing a drill, in the yardage book's own line: pine ink on the
 * cream paper, a green, a hole, a ball, a tee, nothing shaded. The motion
 * is the browser's own SVG animation (animateMotion along the very path
 * that is drawn, animateTransform for a swing or a clock hand): no
 * library, nothing to load, a ball that follows its arc exactly, and on
 * paper the drawing stands still at whatever frame the page was on.
 *
 * Timing is the golf's: a swing goes back slowly and comes through fast
 * (about three to one), the ball leaves on the strike, rolls out and
 * stops; then a beat of nothing before it goes again. A reader who has
 * asked the phone for less motion gets the still drawing (still()). */

const INK = 'var(--ink)', TURF = 'var(--turf)', GOLD = 'var(--gold-up)', GREEN = '#DCE3D2', SAND = '#EADFC0', PAPER = 'var(--paper)', FLAG = 'var(--flag)';
const svg = (label, body, vb = '0 0 320 200') => `<svg class="da" viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${PAPER}"/>${body}</svg>`;
const green = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${GREEN}" stroke="${INK}" stroke-width="1.4"/>`;
const hole = (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="${INK}"/>`;
const flag = (x, y) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 34}" stroke="${INK}" stroke-width="1.6"/><path d="M${x} ${y - 34} l16 5 -16 6z" fill="${FLAG}"/>`;
const tee = (x, y, c = INK) => `<path d="M${x - 3} ${y - 7} h6 l-1 3 h-1.4 l-0.6 9 h-2 l-0.6 -9 h-1.4z" fill="${c}"/>`;
const dash = d => `<path d="${d}" fill="none" stroke="${TURF}" stroke-width="1.4" stroke-dasharray="4 4"/>`;
const line = (x1, y1, x2, y2, w = 1.6, c = INK) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const text = (x, y, t, size = 11, anchor = 'middle', c = TURF) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${c}" font-family="inherit">${t}</text>`;
const towel = (x, y, w = 36, h = 14) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"/><line x1="${x + 6}" y1="${y}" x2="${x + 6}" y2="${y + h}" stroke="${INK}" stroke-width="1"/><line x1="${x + w - 6}" y1="${y}" x2="${x + w - 6}" y2="${y + h}" stroke="${INK}" stroke-width="1"/>`;
const card = (x, y, w, h, rows) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"/>${rows.map((r, i) => text(x + 8, y + 16 + i * 14, r, 10, 'start', INK)).join('')}`;

/* ---- the motion ----
   A ball is drawn at the origin and carried along a path; the path begins
   where the ball lies, so the still drawing and the moving one agree.
   `at` is the moment in the cycle (0 to 1) the ball leaves; it sits until
   then, travels to `to`, rests, fades, and the cycle starts again. */
const EASE_OUT = '0.2 0.6 0.4 1', EASE_IN = '0.6 0 0.9 0.6', LINEAR = '0 0 1 1', EASE = '0.4 0 0.6 1';
const num = n => +n.toFixed(3);
/* keyTimes must climb from 0 to 1: a swing that starts early in the cycle is squeezed, never pushed before the start */
const times = list => { const out = []; let last = -1; for (let i = 0; i < list.length; i++) { let v = i === 0 ? 0 : i === list.length - 1 ? 1 : Math.min(0.99, Math.max(last + 0.01, list[i])); out.push(num(v)); last = v; } return out.join(';'); };
function ball(path, dur, o = {}) {
  const at = o.at == null ? 0.12 : o.at, to = o.to == null ? at + 0.5 : o.to, begin = o.begin || 0;
  const keyTimes = times([0, at, to, Math.min(0.97, to + 0.12), 1]);
  const keyPoints = '0;0;1;1;1', splines = `${LINEAR};${o.ease || EASE_OUT};${LINEAR};${LINEAR}`;
  return `<circle r="5" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4">
    <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${path}" calcMode="spline" keyTimes="${keyTimes}" keyPoints="${keyPoints}" keySplines="${splines}"/>
    <animate attributeName="opacity" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" values="1;1;1;0;0;1" keyTimes="${times([0, at, Math.min(0.96, to + 0.1), Math.min(0.985, to + 0.14), 0.99, 1])}"/>
  </circle>`;
}
/* a ball that just sits (the still copy of a moving one) */
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"/>`;
/* a thing that pulses: a target, a station, a step in a routine */
const pulse = (dur = 2.4, begin = 0, lo = 0.3) => `<animate attributeName="opacity" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" values="1;${lo};1" keyTimes="0;0.5;1" calcMode="spline" keySplines="${EASE};${EASE}"/>`;
const target = (x, y, r = 22, begin = 0) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="3 3">${pulse(2, begin)}</circle>`;
/* the little golfer, side on, whose club goes back slowly and comes through fast; the ball leaves at `at` of the cycle */
function golfer(x, y, dur, o = {}) {
  const at = o.at == null ? 0.45 : o.at, swing = o.swing == null ? -110 : o.swing, thru = o.thru == null ? 70 : o.thru;
  const kt = times([0, at - 0.3, at - 0.06, at, at + 0.1, at + 0.4, 1]);
  const vals = `0;0;${swing};0;${thru};${thru};0`;
  const spl = `${LINEAR};${EASE_OUT};${EASE_IN};${LINEAR};${EASE_OUT};${EASE}`;
  const sx = x, sy = y - 50;   // the shoulder, which the club turns about
  return `<g>
    <circle cx="${x}" cy="${y - 62}" r="7" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <path d="M${x} ${y - 55} v24 l-8 26 M${x} ${y - 31} l9 26" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M${sx} ${sy} l12 22 l6 2" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round">
      ${dur ? `<animateTransform attributeName="transform" type="rotate" dur="${dur}s" repeatCount="indefinite" values="${vals.split(';').map(v => v + ' ' + sx + ' ' + sy).join(';')}" keyTimes="${kt}" calcMode="spline" keySplines="${spl}"/>` : ''}
    </path></g>`;
}
/* a putter: a short stroke back and through, the ball leaving at `at` */
function putter(x, y, dur, at = 0.3) {
  const kt = times([0, at - 0.22, at - 0.03, at + 0.06, at + 0.3, 1]);
  return `<g><line x1="${x}" y1="${y - 60}" x2="${x + 6}" y2="${y - 4}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><rect x="${x}" y="${y - 5}" width="16" height="6" rx="1.5" fill="${INK}"/>
    ${dur ? `<animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;-14 0;10 0;10 0;0 0" keyTimes="${kt}" calcMode="spline" keySplines="${LINEAR};${EASE_OUT};${EASE_IN};${LINEAR};${EASE}"/>` : ''}</g>`;
}

const ART = {
  gate: () => svg('A ball rolling through a gate of two tees into the hole', `
    ${green(160, 120, 140, 56)}${hole(250, 118)}
    ${tee(118, 104)}${tee(118, 134)}
    ${putter(78, 124, 4, 0.3)}
    ${dash('M100 119 H244')}${text(118, 92, 'a coin each side', 10)}
    ${ball('M100 119 H249', 4, { at: 0.3, to: 0.7 })}`),
  clock: () => svg('Twelve balls in a circle round the hole, like a clock', `
    ${green(160, 100, 120, 80)}${hole(160, 100)}
    ${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; const x = num(160 + Math.cos(a) * 60), y = num(100 + Math.sin(a) * 50); return ball(`M${x} ${y} L${num(160 + Math.cos(a) * 4)} ${num(100 + Math.sin(a) * 4)}`, 9.6, { at: 0.06 + i * 0.066, to: 0.1 + i * 0.066 }); }).join('')}
    ${text(160, 30, '3 ft, then 4, then 5', 10)}`),
  ladder: () => svg('Four tees in a line at ten, twenty, thirty and forty feet', `
    ${green(160, 110, 150, 60)}
    ${[70, 130, 190, 250].map((x, i) => tee(x, 100) + text(x, 150, (i + 1) * 10 + ' ft', 10)).join('')}
    ${putter(28, 118, 8, 0.1)}${[0, 1, 2, 3].map(i => ball(`M48 113 H${74 + i * 60}`, 8, { at: 0.1 + i * 0.22, to: 0.22 + i * 0.22 })).join('')}`),
  circle: () => svg('A three-foot circle of tees round the hole, a ball finishing just past it', `
    ${green(190, 110, 120, 70)}${hole(220, 108)}
    ${[0, 60, 120, 180, 240, 300].map(a => { const r = a * Math.PI / 180; return tee(num(220 + Math.cos(r) * 40), num(108 + Math.sin(r) * 30)); }).join('')}
    ${putter(40, 120, 4.5, 0.25)}${dash('M60 113 H232')}
    ${ball('M60 113 H236', 4.5, { at: 0.25, to: 0.72 })}
    ${text(220, 170, 'past the hole, inside the circle', 10)}`),
  threesixnine: () => svg('Three stations at three, six and nine feet from the hole', `
    ${green(160, 110, 150, 60)}${hole(270, 108)}
    ${[['3 ft', 210], ['6 ft', 150], ['9 ft', 90]].map(([l, x]) => tee(x, 100) + text(x, 150, l, 10)).join('')}
    ${ball('M210 113 H269', 7.5, { at: 0.08, to: 0.22 })}${ball('M150 113 H269', 7.5, { at: 0.38, to: 0.6 })}${ball('M90 113 H269', 7.5, { at: 0.7, to: 0.96 })}
    ${text(160, 36, 'three in a row at each, or back to the start', 10)}`),
  eyes: () => svg('A golfer putting while looking at the hole', `
    ${green(190, 125, 125, 55)}${hole(270, 122)}
    ${golfer(70, 150, 5, { at: 0.4, swing: -25, thru: 20 })}<path d="M74 92 Q170 70 262 112" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="3 4"><animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1.2s" repeatCount="indefinite"/></path>
    ${ball('M96 150 Q180 136 268 123', 5, { at: 0.4, to: 0.82 })}${text(170, 60, 'eyes on the hole, not the ball', 10)}`),
  updown: () => svg('Nine balls round a green, each chipped and putted out', `
    ${green(160, 100, 110, 60)}${hole(160, 100)}${flag(160, 100)}
    ${[[40, 60], [160, 22], [285, 60], [300, 130], [230, 176], [90, 180], [22, 130], [60, 152], [265, 40]].map(([x, y], i) => dash(`M${x} ${y} L160 100`) + ball(`M${x} ${y} Q${num((x + 160) / 2)} ${num((y + 100) / 2 - 26)} 160 100`, 13.5, { at: 0.04 + i * 0.105, to: 0.1 + i * 0.105, ease: LINEAR })).join('')}`),
  towel: () => svg('A chip landing on a towel and running to the hole', `
    ${green(190, 120, 125, 56)}${hole(282, 118)}
    ${towel(150, 112, 40, 12)}${golfer(48, 150, 5, { at: 0.42, swing: -60, thru: 40 })}
    ${dash('M70 146 Q110 70 170 116')}
    ${ball('M70 146 Q110 70 170 116 L278 118', 5, { at: 0.42, to: 0.86, ease: '0.3 0.2 0.5 1' })}${text(170, 150, 'land here', 10)}`),
  clockface: () => svg('A swing drawn as a clock: lead arm at 7:30, 9:00 and 10:30', `
    <circle cx="160" cy="110" r="70" fill="none" stroke="${INK}" stroke-width="1.4"/>
    ${[['12', 160, 32], ['9', 82, 114], ['3', 238, 114], ['6', 160, 196]].map(([t, x, y]) => text(x, y, t, 11, 'middle', INK)).join('')}
    ${[['7:30', 135], ['9:00', 180], ['10:30', 225]].map(([l, a], i) => { const r = a * Math.PI / 180; const x = num(160 + Math.cos(r) * 70), y = num(110 + Math.sin(r) * 70); return line(160, 110, x, y, 2, i === 1 ? INK : GOLD) + text(x - 12, y - 6, l, 10, 'end', INK); }).join('')}
    <line x1="160" y1="110" x2="160" y2="40" stroke="${FLAG}" stroke-width="2.4" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" dur="6s" repeatCount="indefinite" values="180 160 110;-135 160 110;-135 160 110;180 160 110;-90 160 110;-90 160 110;180 160 110;-45 160 110;-45 160 110;180 160 110" keyTimes="0;0.14;0.24;0.33;0.47;0.57;0.66;0.8;0.9;1" calcMode="spline" keySplines="${EASE_OUT};${LINEAR};${EASE_IN};${EASE_OUT};${LINEAR};${EASE_IN};${EASE_OUT};${LINEAR};${EASE_IN}"/>
    </line>
    ${text(160, 190, 'three lengths, three distances', 10)}`),
  bunker: () => svg('A line drawn in the sand two inches behind the ball', `
    <path d="M20 140 Q160 90 300 140 L300 190 L20 190z" fill="${SAND}" stroke="${INK}" stroke-width="1.4"/>
    ${line(120, 112, 120, 172, 2, FLAG)}
    ${golfer(70, 150, 5, { at: 0.45, swing: -100, thru: 60 })}
    <path d="M116 134 q20 -18 46 -4" fill="none" stroke="${TURF}" stroke-width="2.2" stroke-dasharray="60" stroke-dashoffset="60"><animate attributeName="stroke-dashoffset" dur="5s" repeatCount="indefinite" values="60;60;0;0;60" keyTimes="0;0.45;0.55;0.9;1"/></path>
    ${ball('M150 128 Q200 60 262 96', 5, { at: 0.47, to: 0.8, ease: LINEAR })}
    ${text(120, 100, 'the line', 10)}${text(150, 112, '2 in', 10)}`),
  pitchladder: () => svg('Four targets at forty, sixty, eighty and a hundred yards', `
    ${[[85, 150, '40'], [140, 120, '60'], [200, 95, '80'], [265, 75, '100']].map(([x, y, l], i) => target(x, y, 14, i * 0.5) + text(x, y + 30, l + ' yd', 10)).join('')}
    ${golfer(30, 190, 10, { at: 0.12, swing: -70, thru: 50 })}${[[85, 150], [140, 120], [200, 95], [265, 75]].map(([x, y], i) => ball(`M48 186 Q${num((48 + x) / 2)} ${num(y - 70 - i * 15)} ${x} ${y}`, 10, { at: 0.12 + i * 0.22, to: 0.22 + i * 0.22, ease: LINEAR })).join('')}`),
  par18: () => svg('Nine holes of chip and putt, par two each', `
    ${green(160, 100, 120, 64)}${hole(160, 100)}${flag(160, 100)}
    ${[[40, 40], [160, 20], [280, 40], [300, 110], [270, 170], [160, 185], [50, 170], [20, 110], [100, 48]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="9" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4">${pulse(9, i * 1, 0.4)}</circle>` + text(x, y + 4, String(i + 1), 10, 'middle', INK)).join('')}
    ${card(236, 136, 70, 48, ['par 18', 'you: 24'])}`),
  sticks: () => svg('Two alignment sticks, one on the target line and one along the toes', `
    <line x1="30" y1="120" x2="300" y2="90" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
    <line x1="30" y1="160" x2="300" y2="130" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
    ${flag(296, 86)}
    <path d="M120 150 l-6 12 h18 l-6 -12z M160 146 l-6 12 h18 l-6 -12z" fill="${INK}"/>
    ${ball('M150 100 L286 86', 4, { at: 0.3, to: 0.6 })}
    ${text(60, 182, 'toes', 10, 'start')}${text(60, 110, 'target line', 10, 'start')}`),
  teegate: () => svg('Two tees either side of the clubhead, the club swung through without touching', `
    ${tee(130, 150)}${tee(190, 150)}
    ${golfer(80, 180, 5, { at: 0.45, swing: -100, thru: 70 })}
    <rect x="146" y="144" width="28" height="12" rx="3" fill="none" stroke="${INK}" stroke-width="1.6">
      <animateTransform attributeName="transform" type="translate" dur="5s" repeatCount="indefinite" values="0 0;0 0;-40 -6;0 0;46 -8;46 -8;0 0" keyTimes="0;0.15;0.39;0.45;0.55;0.85;1" calcMode="spline" keySplines="${LINEAR};${EASE_OUT};${EASE_IN};${EASE_OUT};${LINEAR};${EASE}"/>
    </rect>
    ${ball('M160 152 Q230 100 300 130', 5, { at: 0.45, to: 0.75, ease: LINEAR })}
    ${text(160, 120, 'a coin wider than the face', 10)}`),
  tempo: () => svg('A metronome: three counts back, one count through', `
    <path d="M130 40 L190 40 L210 180 L110 180z" fill="#FBFAF7" stroke="${INK}" stroke-width="1.6"/>
    <line x1="160" y1="170" x2="160" y2="60" stroke="${FLAG}" stroke-width="2.4" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" dur="2.4s" repeatCount="indefinite" values="-28 160 170;28 160 170;-28 160 170" keyTimes="0;0.75;1" calcMode="spline" keySplines="${EASE};${EASE}"/>
    </line>
    ${text(60, 100, '1 · 2 · 3', 13, 'middle', INK)}${text(260, 100, '· 1', 13, 'middle', INK)}
    ${text(60, 120, 'back', 10)}${text(260, 120, 'through', 10)}`),
  feet: () => svg('A golfer swinging with the feet together', `
    <circle cx="160" cy="68" r="8" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <path d="M160 76 v30 l-5 50 M160 106 l5 50" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M160 84 l-22 36 l-4 8" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" dur="5s" repeatCount="indefinite" values="0 160 84;0 160 84;-120 160 84;0 160 84;80 160 84;80 160 84;0 160 84" keyTimes="0;0.15;0.39;0.45;0.55;0.85;1" calcMode="spline" keySplines="${LINEAR};${EASE_OUT};${EASE_IN};${LINEAR};${EASE_OUT};${EASE}"/>
    </path>
    <line x1="60" y1="158" x2="260" y2="158" stroke="${TURF}" stroke-width="1.2"/>
    ${text(160, 184, 'feet touching · three-quarter swing · hold the finish', 10)}`),
  heights: () => svg('Three ball flights from the same club: low, normal, high', `
    ${golfer(40, 170, 9, { at: 0.08, swing: -100, thru: 70 })}${flag(290, 166)}
    <path d="M60 166 Q170 120 290 166" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M60 166 Q170 70 290 166" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M60 166 Q170 20 290 166" fill="none" stroke="${INK}" stroke-width="1.4"/>
    ${text(175, 136, 'low', 10)}${text(175, 112, 'normal', 10)}${text(175, 62, 'high', 10)}
    ${ball('M60 166 Q170 120 290 166', 9, { at: 0.08, to: 0.3, ease: LINEAR })}${ball('M60 166 Q170 70 290 166', 9, { at: 0.38, to: 0.62, ease: LINEAR })}${ball('M60 166 Q170 20 290 166', 9, { at: 0.7, to: 0.96, ease: LINEAR })}`),
  fairway: () => svg('Two targets forty yards apart: a fairway on the range', `
    <path d="M110 40 L210 40 L300 190 L20 190z" fill="${GREEN}" stroke="${INK}" stroke-width="1.4"/>
    ${flag(118, 46)}${flag(202, 46)}${text(160, 30, '40 yards', 10)}
    ${golfer(160, 196, 9, { at: 0.1, swing: -100, thru: 70 })}${[[134, 46], [174, 46], [200, 46]].map(([x, y], i) => ball(`M160 192 Q${num((160 + x) / 2 + (i - 1) * 10)} 80 ${x} ${y}`, 9, { at: 0.1 + i * 0.3, to: 0.26 + i * 0.3, ease: LINEAR })).join('')}`),
  towelback: () => svg('A towel six inches behind the ball, the club missing it', `
    <line x1="20" y1="160" x2="300" y2="160" stroke="${TURF}" stroke-width="1.4"/>
    ${towel(96, 148, 40, 12)}
    ${golfer(90, 150, 5, { at: 0.45, swing: -100, thru: 70 })}
    ${ball('M170 154 Q240 90 300 120', 5, { at: 0.46, to: 0.78, ease: LINEAR })}
    ${text(116, 182, '6 in', 10)}${line(136, 170, 170, 170, 1, TURF)}${text(230, 140, 'low point here', 10)}`),
  routine: () => svg('A twenty-second routine: decide, look, rehearse, walk in, go', `
    ${[['decide', 40], ['look', 100], ['rehearse', 160], ['walk in', 220], ['go', 280]].map(([l, x], i) => `<circle cx="${x}" cy="90" r="16" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"><animate attributeName="fill" dur="5s" begin="0s" repeatCount="indefinite" values="#FBFAF7;#FBFAF7;${GREEN};${GREEN};#FBFAF7;#FBFAF7" keyTimes="0;${num(i * 0.19)};${num(i * 0.19 + 0.02)};${num(i * 0.19 + 0.17)};${num(Math.min(0.99, i * 0.19 + 0.19))};1"/></circle>` + text(x, 94, String(i + 1), 11, 'middle', INK) + text(x, 128, l, 10)).join('')}
    ${line(56, 90, 84, 90, 1.4, TURF)}${line(116, 90, 144, 90, 1.4, TURF)}${line(176, 90, 204, 90, 1.4, TURF)}${line(236, 90, 264, 90, 1.4, TURF)}
    ${text(160, 170, '20 seconds, the same every time', 11, 'middle', INK)}`),
  worstball: () => svg('Two balls hit, the worse one played', `
    ${dash('M40 190 Q160 160 300 60')}
    ${golfer(40, 196, 7, { at: 0.12, swing: -100, thru: 70 })}
    ${ball('M58 192 Q100 120 140 100', 7, { at: 0.12, to: 0.36, ease: LINEAR })}${ball('M58 192 Q120 150 190 150', 7, { at: 0.42, to: 0.66, ease: LINEAR })}
    <circle cx="190" cy="150" r="12" fill="none" stroke="${FLAG}" stroke-width="1.6"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" values="0;0;1;0.3;1;0.3;1;0" keyTimes="0;0.66;0.7;0.78;0.86;0.92;0.97;1"/></circle>
    ${text(200, 180, 'play this one', 10, 'start', FLAG)}${text(150, 86, 'not this one', 10, 'start')}`),
  bogey: () => svg('A scorecard with no number worse than bogey', `
    ${card(60, 40, 200, 120, [])}
    ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((h, i) => text(80 + i * 22, 62, h, 10)).join('')}
    ${['5', '4', '5', '6', '4', '5', '5', '4', '5'].map((h, i) => `<text x="${80 + i * 22}" y="90" font-size="12" text-anchor="middle" fill="${INK}" font-family="inherit" opacity="0"><animate attributeName="opacity" dur="7s" repeatCount="indefinite" values="0;0;1;1;0" keyTimes="0;${num(0.05 + i * 0.08)};${num(0.09 + i * 0.08)};0.92;1"/>${h}</text>`).join('')}
    <line x1="70" y1="70" x2="250" y2="70" stroke="${INK}" stroke-width="1"/>
    ${text(160, 128, 'no doubles · 8 of 9', 11, 'middle', INK)}${text(160, 146, 'count the pars that came by themselves', 10)}`),
  centergreen: () => svg('The middle of the green as the target, the flag ignored', `
    ${green(160, 100, 120, 64)}${flag(250, 80)}${hole(250, 80)}
    ${target(160, 100, 30)}${golfer(30, 196, 6, { at: 0.3, swing: -100, thru: 70 })}
    ${ball('M48 192 Q110 40 160 100', 6, { at: 0.3, to: 0.62, ease: LINEAR })}
    ${text(160, 160, 'middle, every time', 10)}`),
  reset: () => svg('Ten seconds: a breath in, a breath out, the next shot', `
    <circle cx="160" cy="100" r="60" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="160" cy="100" r="30" fill="${GREEN}" stroke="${INK}" stroke-width="1.4">
      <animateTransform attributeName="transform" type="scale" dur="10s" repeatCount="indefinite" values="0.7;1.6;0.7" keyTimes="0;0.4;1" calcMode="spline" keySplines="${EASE};${EASE}" additive="sum"/>
      <animateTransform attributeName="transform" type="translate" dur="10s" repeatCount="indefinite" values="48 30;-96 -60;48 30" keyTimes="0;0.4;1" calcMode="spline" keySplines="${EASE};${EASE}"/>
    </circle>
    ${text(160, 184, 'in for four · out for six · the hole is new', 10)}`),
  punch: () => svg('A low runner under the branches, finishing in the fairway', `
    <path d="M100 20 q30 40 0 70 M130 10 q20 40 10 60 M70 30 q30 30 20 60" fill="none" stroke="${TURF}" stroke-width="1.6"/>
    <line x1="20" y1="160" x2="300" y2="160" stroke="${TURF}" stroke-width="1.4"/>
    ${golfer(40, 162, 5, { at: 0.42, swing: -70, thru: 30 })}${dash('M60 158 Q150 118 300 154')}
    ${ball('M60 158 Q150 118 300 154', 5, { at: 0.42, to: 0.8, ease: '0.2 0.4 0.5 1' })}
    ${line(60, 110, 300, 110, 1, FLAG)}${text(180, 104, 'head height', 10, 'middle', FLAG)}`),
  numbers: () => svg('A yardage card: a number a club', `
    ${card(90, 30, 140, 140, [])}
    ${['SW   78', 'GW   92', 'PW  108', '9i   120', '8i   132'].map((r, i) => `<text x="98" y="${46 + i * 14}" font-size="10" text-anchor="start" fill="${INK}" font-family="inherit" opacity="0"><animate attributeName="opacity" dur="8s" repeatCount="indefinite" values="0;0;1;1;0" keyTimes="0;${num(0.08 + i * 0.14)};${num(0.14 + i * 0.14)};0.92;1"/>${r}</text>`).join('')}
    ${text(160, 190, 'measured, averaged, written down', 10)}`),
  partner: () => svg('Two pairs on the putting green, better ball', `
    ${green(160, 100, 130, 70)}${hole(230, 96)}
    ${ball('M70 110 L226 97', 6, { at: 0.1, to: 0.45 })}${ball('M90 70 L226 95', 6, { at: 0.5, to: 0.85 })}
    <path d="M60 150 l-6 -18 M70 150 l6 -18 M80 60 l-6 -18 M90 60 l6 -18" fill="none" stroke="${INK}" stroke-width="1.6"/>
    ${text(160, 184, 'who putts first? the first putt shows the second', 10)}`),
  safeball: () => svg('One partner in the trees, the other playing to the middle of the green', `
    ${green(240, 90, 60, 36)}${hole(240, 90)}${flag(262, 74)}
    <path d="M40 40 q20 30 0 60 M60 30 q25 30 10 70" fill="none" stroke="${TURF}" stroke-width="1.6"/>
    ${dot(52, 70)}${text(52, 110, 'partner: gone', 10)}
    ${golfer(120, 196, 6, { at: 0.3, swing: -100, thru: 70 })}${ball('M138 192 Q190 60 240 92', 6, { at: 0.3, to: 0.62, ease: LINEAR })}
    ${text(170, 150, 'you: the middle', 10)}`),
  pressure: () => svg('A three-foot putt, twenty-five times in a row', `
    ${green(160, 110, 140, 56)}${hole(220, 108)}${tee(130, 100)}
    ${putter(90, 118, 3, 0.3)}${ball('M130 113 H219', 3, { at: 0.3, to: 0.62 })}
    ${card(236, 150, 64, 36, ['24 / 25'])}${text(160, 50, 'miss, and it is nought again', 10)}`),
  warmup: () => svg('The warm-up in order: putting, chipping, the range, the first tee', `
    ${[['putt', 50], ['chip', 125], ['range', 200], ['1st tee', 275]].map(([l, x], i) => `<rect x="${x - 28}" y="70" width="56" height="48" rx="8" fill="${i === 3 ? GREEN : '#FBFAF7'}" stroke="${INK}" stroke-width="1.4"><animate attributeName="stroke-width" dur="6s" repeatCount="indefinite" values="1.4;1.4;3;3;1.4;1.4" keyTimes="0;${num(i * 0.24)};${num(i * 0.24 + 0.02)};${num(i * 0.24 + 0.2)};${num(Math.min(0.99, i * 0.24 + 0.24))};1"/></rect>` + text(x, 92, ['5 min', '5 min', '8 min', 'go'][i], 11, 'middle', INK) + text(x, 108, l, 10)).join('')}
    ${line(80, 94, 95, 94, 1.4, TURF)}${line(155, 94, 170, 94, 1.4, TURF)}${line(230, 94, 245, 94, 1.4, TURF)}
    ${text(160, 160, 'green first, driver last', 11, 'middle', INK)}`),
  mirror: () => svg('A golfer at address in front of a mirror', `
    <rect x="190" y="30" width="100" height="150" rx="6" fill="#F3F1EA" stroke="${INK}" stroke-width="1.6"/>
    ${golfer(110, 180, 6, { at: 0.5, swing: -90, thru: 0 })}<g opacity=".55">${golfer(240, 180, 6, { at: 0.5, swing: -90, thru: 0 })}</g>
    ${text(240, 196, 'the mirror', 10)}${text(110, 196, 'two knuckles · hips back · arms hang', 10)}`),
};
export function art(key) { const f = ART[key]; return f ? f() : ''; }
export const ART_KEYS = Object.keys(ART);
/** A reader who asked the phone for less motion gets the drawings still; a printer too. */
export function still(root) {
  const quiet = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!quiet) return 0;
  let n = 0;
  (root || document).querySelectorAll('svg.da').forEach(s => { if (s.pauseAnimations) { s.pauseAnimations(); n++; } });
  return n;
}
