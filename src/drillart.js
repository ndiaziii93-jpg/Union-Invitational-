/* The Union Invitational — the drawings in the practice manual.
 *
 * One drawing a drill, in the yardage book's own line: pine ink on the
 * cream paper, a green, a hole, a ball, a tee, nothing shaded. The motion
 * is a few CSS classes (styles.css, .da-*) so a ball rolls through its
 * gate on a screen and sits still on paper; a reader who asked for less
 * motion gets the still drawing. Every drawing is an inline SVG, so it
 * prints at any size and weighs nothing. */

const INK = 'var(--ink)', TURF = 'var(--turf)', GOLD = 'var(--gold-up)', GREEN = '#DCE3D2', SAND = '#EADFC0', PAPER = 'var(--paper)';
const svg = (label, body, vb = '0 0 320 200') => `<svg class="da" viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${PAPER}"/>${body}</svg>`;
const green = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${GREEN}" stroke="${INK}" stroke-width="1.4"/>`;
const hole = (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="${INK}"/>`;
const flag = (x, y) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 34}" stroke="${INK}" stroke-width="1.6"/><path d="M${x} ${y - 34} l16 5 -16 6z" fill="var(--flag)"/>`;
const ball = (x, y, cls = '', style = '') => `<circle class="${cls}" cx="${x}" cy="${y}" r="5" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"${style ? ` style="${style}"` : ''}/>`;
const tee = (x, y, c = INK) => `<path d="M${x - 3} ${y - 7} h6 l-1 3 h-1.4 l-0.6 9 h-2 l-0.6 -9 h-1.4z" fill="${c}"/>`;
const dash = (d, cls = '') => `<path class="${cls}" d="${d}" fill="none" stroke="${TURF}" stroke-width="1.4" stroke-dasharray="4 4"/>`;
const line = (x1, y1, x2, y2, w = 1.6, c = INK) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const text = (x, y, t, size = 11, anchor = 'middle', c = TURF) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${c}" font-family="inherit">${t}</text>`;
const putter = (x, y) => `<line x1="${x}" y1="${y - 60}" x2="${x + 6}" y2="${y - 4}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><rect x="${x}" y="${y - 5}" width="16" height="6" rx="1.5" fill="${INK}"/>`;
const stick = (x, y, h = 60, c = GOLD) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
/* a golfer: the yardage book's little figure, seen from the side, with the club back or through */
const golfer = (x, y, cls = '') => `<g class="${cls}" style="transform-box:fill-box;transform-origin:50% 90%">
  <circle cx="${x}" cy="${y - 62}" r="7" fill="none" stroke="${INK}" stroke-width="1.6"/>
  <path d="M${x} ${y - 55} v24 l-8 26 M${x} ${y - 31} l9 26" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M${x} ${y - 50} l12 22" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/></g>`;
const towel = (x, y, w = 36, h = 14) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"/><line x1="${x + 6}" y1="${y}" x2="${x + 6}" y2="${y + h}" stroke="${INK}" stroke-width="1"/><line x1="${x + w - 6}" y1="${y}" x2="${x + w - 6}" y2="${y + h}" stroke="${INK}" stroke-width="1"/>`;
const target = (x, y, r = 22) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="3 3" class="da-blink"/>`;
const card = (x, y, w, h, rows) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"/>${rows.map((r, i) => text(x + 8, y + 16 + i * 14, r, 10, 'start', INK)).join('')}`;

const ART = {
  gate: () => svg('A ball rolling through a gate of two tees into the hole', `
    ${green(160, 120, 140, 56)}${hole(250, 118)}
    ${tee(118, 104)}${tee(118, 134)}
    ${putter(78, 124)}
    ${ball(100, 119, 'da-roll', '--dx:144px;--dur:2.4s')}
    ${dash('M100 119 H244')}${text(118, 92, 'a coin each side', 10)}`),
  clock: () => svg('Twelve balls in a circle round the hole, like a clock', `
    ${green(160, 100, 120, 80)}${hole(160, 100)}
    ${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; return ball(160 + Math.cos(a) * 60, 100 + Math.sin(a) * 50, 'da-pulse', '--d:' + (i * 0.2) + 's'); }).join('')}
    ${text(160, 30, '3 ft, then 4, then 5', 10)}`),
  ladder: () => svg('Four tees in a line at ten, twenty, thirty and forty feet', `
    ${green(160, 110, 150, 60)}
    ${[70, 130, 190, 250].map((x, i) => tee(x, 100) + text(x, 150, (i + 1) * 10 + ' ft', 10)).join('')}
    ${putter(28, 118)}${[0, 1, 2, 3].map(i => ball(48, 113, 'da-roll', `--dx:${20 + i * 60}px;--dur:${1.6 + i * 0.5}s;--d:${i * 0.4}s`)).join('')}`),
  circle: () => svg('A three-foot circle of tees round the hole, a ball finishing just past it', `
    ${green(190, 110, 120, 70)}${hole(220, 108)}
    ${[0, 60, 120, 180, 240, 300].map(a => { const r = a * Math.PI / 180; return tee(220 + Math.cos(r) * 40, 108 + Math.sin(r) * 30); }).join('')}
    ${putter(40, 120)}${ball(60, 113, 'da-roll', '--dx:172px;--dur:2.6s')}${dash('M60 113 H232')}
    ${text(220, 170, 'past the hole, inside the circle', 10)}`),
  threesixnine: () => svg('Three stations at three, six and nine feet from the hole', `
    ${green(160, 110, 150, 60)}${hole(270, 108)}
    ${[['3 ft', 210], ['6 ft', 150], ['9 ft', 90]].map(([l, x]) => tee(x, 100) + text(x, 150, l, 10)).join('')}
    ${ball(90, 113, 'da-roll', '--dx:172px;--dur:2.2s;--d:0s')}${ball(150, 113, 'da-roll', '--dx:112px;--dur:1.8s;--d:0.8s')}${ball(210, 113, 'da-roll', '--dx:52px;--dur:1.4s;--d:1.6s')}
    ${text(160, 36, 'three in a row at each, or back to the start', 10)}`),
  eyes: () => svg('A golfer putting while looking at the hole', `
    ${green(190, 125, 125, 55)}${hole(270, 122)}
    ${golfer(70, 150)}<path d="M74 92 Q170 70 262 112" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="3 4" class="da-dash"/>
    ${ball(96, 150, 'da-roll', '--dx:168px;--dy:-26px;--dur:2.6s')}${text(170, 60, 'eyes on the hole, not the ball', 10)}`),
  updown: () => svg('Nine balls round a green, each chipped and putted out', `
    ${green(160, 100, 110, 60)}${hole(160, 100)}${flag(160, 100)}
    ${[[40, 60], [160, 22], [285, 60], [300, 130], [230, 176], [90, 180], [22, 130], [60, 152], [265, 40]].map(([x, y], i) => ball(x, y, 'da-pulse', '--d:' + i * 0.25 + 's') + dash(`M${x} ${y} L160 100`)).join('')}`),
  towel: () => svg('A chip landing on a towel and running to the hole', `
    ${green(190, 120, 125, 56)}${hole(282, 118)}
    ${towel(150, 112, 40, 12)}${golfer(48, 150)}
    <path d="M70 146 Q110 70 170 116" fill="none" stroke="${TURF}" stroke-width="1.4" stroke-dasharray="4 4"/>
    ${ball(70, 146, 'da-chip', '--mx:100px;--my:-70px;--dx:200px;--dy:-30px;--dur:2.8s')}${text(170, 150, 'land here', 10)}`),
  clockface: () => svg('A swing drawn as a clock: lead arm at 7:30, 9:00 and 10:30', `
    <circle cx="160" cy="110" r="70" fill="none" stroke="${INK}" stroke-width="1.4"/>
    ${[['12', 160, 32], ['9', 82, 114], ['3', 238, 114], ['6', 160, 196]].map(([t, x, y]) => text(x, y, t, 11, 'middle', INK)).join('')}
    ${[['7:30', 135], ['9:00', 180], ['10:30', 225]].map(([l, a], i) => { const r = a * Math.PI / 180; const x = 160 + Math.cos(r) * 70, y = 110 + Math.sin(r) * 70; return line(160, 110, x, y, 2, i === 1 ? INK : GOLD) + text(x - 12, y - 6, l, 10, 'end', INK); }).join('')}
    <line class="da-hand" x1="160" y1="110" x2="160" y2="40" stroke="var(--flag)" stroke-width="2.4" stroke-linecap="round" style="transform-box:view-box;transform-origin:160px 110px"/>
    ${text(160, 190, 'three lengths, three distances', 10)}`),
  bunker: () => svg('A line drawn in the sand two inches behind the ball', `
    <path d="M20 140 Q160 90 300 140 L300 190 L20 190z" fill="${SAND}" stroke="${INK}" stroke-width="1.4"/>
    ${line(120, 112, 120, 172, 2, 'var(--flag)')}${ball(150, 128)}
    ${golfer(70, 150)}<path class="da-splash" d="M118 132 q18 -14 40 -2" fill="none" stroke="${TURF}" stroke-width="2" stroke-dasharray="40" style="--len:60"/>
    ${text(120, 100, 'the line', 10)}${text(150, 112, '2 in', 10)}`),
  pitchladder: () => svg('Four targets at forty, sixty, eighty and a hundred yards', `
    ${[[85, 150, '40'], [140, 120, '60'], [200, 95, '80'], [265, 75, '100']].map(([x, y, l]) => target(x, y, 14) + text(x, y + 30, l + ' yd', 10)).join('')}
    ${golfer(30, 190)}${[0, 1, 2, 3].map(i => ball(48, 186, 'da-chip', `--mx:${[20, 50, 85, 120][i]}px;--my:${[-70, -90, -110, -130][i]}px;--dx:${[37, 92, 152, 217][i]}px;--dy:${[-36, -66, -91, -111][i]}px;--dur:2.6s;--d:${i * 0.7}s`)).join('')}`),
  par18: () => svg('Nine holes of chip and putt, par two each', `
    ${green(160, 100, 120, 64)}${hole(160, 100)}${flag(160, 100)}
    ${[[40, 40], [160, 20], [280, 40], [300, 110], [270, 170], [160, 185], [50, 170], [20, 110], [100, 48]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="9" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4"/>` + text(x, y + 4, String(i + 1), 10, 'middle', INK)).join('')}
    ${card(236, 136, 70, 48, ['par 18', 'you: 24'])}`),
  sticks: () => svg('Two alignment sticks, one on the target line and one along the toes', `
    <line x1="30" y1="120" x2="300" y2="90" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
    <line x1="30" y1="160" x2="300" y2="130" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
    ${ball(150, 100)}${flag(296, 86)}
    <path d="M120 150 l-6 12 h18 l-6 -12z M160 146 l-6 12 h18 l-6 -12z" fill="${INK}"/>
    ${text(60, 182, 'toes', 10, 'start')}${text(60, 110, 'target line', 10, 'start')}`),
  teegate: () => svg('Two tees either side of the clubhead, the club swung through without touching', `
    ${tee(130, 150)}${tee(190, 150)}${ball(160, 152)}
    ${golfer(80, 180)}<path class="da-sweep" d="M100 170 Q160 150 220 170" fill="none" stroke="${TURF}" stroke-width="1.4" stroke-dasharray="4 4"/>
    <rect class="da-club" x="146" y="144" width="28" height="12" rx="3" fill="none" stroke="${INK}" stroke-width="1.6" style="--dx:36px"/>
    ${text(160, 120, 'a coin wider than the face', 10)}`),
  tempo: () => svg('A metronome: three counts back, one count through', `
    <path d="M130 40 L190 40 L210 180 L110 180z" fill="#FBFAF7" stroke="${INK}" stroke-width="1.6"/>
    <line class="da-tick" x1="160" y1="170" x2="160" y2="60" stroke="var(--flag)" stroke-width="2.4" stroke-linecap="round" style="transform-box:view-box;transform-origin:160px 170px"/>
    ${text(60, 100, '1 · 2 · 3', 13, 'middle', INK)}${text(260, 100, '· 1', 13, 'middle', INK)}
    ${text(60, 120, 'back', 10)}${text(260, 120, 'through', 10)}`),
  feet: () => svg('A golfer swinging with the feet together', `
    <g style="transform-box:fill-box;transform-origin:50% 90%">
    <circle cx="160" cy="68" r="8" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <path d="M160 76 v30 l-5 50 M160 106 l5 50" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <path class="da-arm" d="M160 84 l-22 36" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" style="transform-box:view-box;transform-origin:160px 84px"/></g>
    <line x1="60" y1="158" x2="260" y2="158" stroke="${TURF}" stroke-width="1.2"/>
    ${text(160, 184, 'feet touching · three-quarter swing · hold the finish', 10)}`),
  heights: () => svg('Three ball flights from the same club: low, normal, high', `
    ${golfer(40, 170)}${flag(290, 166)}
    <path d="M60 166 Q170 120 290 166" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M60 166 Q170 70 290 166" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M60 166 Q170 20 290 166" fill="none" stroke="${INK}" stroke-width="1.4"/>
    ${text(175, 136, 'low', 10)}${text(175, 112, 'normal', 10)}${text(175, 62, 'high', 10)}
    ${ball(60, 166, 'da-fly', '--mx:115px;--my:-100px;--dx:230px;--dy:0px;--dur:2.4s')}`),
  fairway: () => svg('Two targets forty yards apart: a fairway on the range', `
    <path d="M110 40 L210 40 L300 190 L20 190z" fill="${GREEN}" stroke="${INK}" stroke-width="1.4"/>
    ${flag(118, 46)}${flag(202, 46)}${text(160, 30, '40 yards', 10)}
    ${golfer(160, 196)}${[0, 1, 2].map(i => ball(160, 192, 'da-fly', `--mx:${[-20, 10, 30][i]}px;--my:-80px;--dx:${[-26, 14, 40][i]}px;--dy:-146px;--dur:2.2s;--d:${i * 0.8}s`)).join('')}`),
  towelback: () => svg('A towel six inches behind the ball, the club missing it', `
    <line x1="20" y1="160" x2="300" y2="160" stroke="${TURF}" stroke-width="1.4"/>
    ${towel(96, 148, 40, 12)}${ball(170, 154)}
    ${golfer(90, 150)}<path class="da-sweep" d="M110 150 Q160 140 230 150" fill="none" stroke="${TURF}" stroke-width="1.4" stroke-dasharray="4 4"/>
    ${text(116, 182, '6 in', 10)}${line(136, 170, 170, 170, 1, TURF)}${text(230, 140, 'low point here', 10)}`),
  routine: () => svg('A twenty-second routine: decide, look, rehearse, walk in, go', `
    ${[['decide', 40], ['look', 100], ['rehearse', 160], ['walk in', 220], ['go', 280]].map(([l, x], i) => `<circle cx="${x}" cy="90" r="16" fill="#FBFAF7" stroke="${INK}" stroke-width="1.4" class="da-pulse" style="--d:${i * 0.5}s"/>` + text(x, 94, String(i + 1), 11, 'middle', INK) + text(x, 128, l, 10)).join('')}
    ${line(56, 90, 84, 90, 1.4, TURF)}${line(116, 90, 144, 90, 1.4, TURF)}${line(176, 90, 204, 90, 1.4, TURF)}${line(236, 90, 264, 90, 1.4, TURF)}
    ${text(160, 170, '20 seconds, the same every time', 11, 'middle', INK)}`),
  worstball: () => svg('Two balls hit, the worse one played', `
    <path d="M40 190 Q160 160 300 60" fill="none" stroke="${TURF}" stroke-width="1.4" stroke-dasharray="4 4"/>
    ${golfer(40, 196)}${ball(140, 100)}${ball(190, 150)}
    <circle cx="190" cy="150" r="12" fill="none" stroke="var(--flag)" stroke-width="1.6" class="da-blink"/>
    ${text(200, 180, 'play this one', 10, 'start', 'var(--flag)')}${text(150, 86, 'not this one', 10, 'start')}`),
  bogey: () => svg('A scorecard with no number worse than bogey', `
    ${card(60, 40, 200, 120, [])}
    ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((h, i) => text(80 + i * 22, 62, h, 10)).join('')}
    ${['5', '4', '5', '6', '4', '5', '5', '4', '5'].map((h, i) => text(80 + i * 22, 90, h, 12, 'middle', INK)).join('')}
    <line x1="70" y1="70" x2="250" y2="70" stroke="${INK}" stroke-width="1"/>
    ${text(160, 128, 'no doubles · 8 of 9', 11, 'middle', INK)}${text(160, 146, 'count the pars that came by themselves', 10)}`),
  centergreen: () => svg('The middle of the green as the target, the flag ignored', `
    ${green(160, 100, 120, 64)}${flag(250, 80)}${hole(250, 80)}
    ${target(160, 100, 30)}${golfer(30, 196)}
    ${ball(48, 192, 'da-fly', '--mx:60px;--my:-120px;--dx:112px;--dy:-92px;--dur:2.4s')}
    ${text(160, 160, 'middle, every time', 10)}`),
  reset: () => svg('Ten seconds: a breath in, a breath out, the next shot', `
    <circle cx="160" cy="100" r="60" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <circle class="da-breathe" cx="160" cy="100" r="30" fill="${GREEN}" stroke="${INK}" stroke-width="1.4" style="transform-box:view-box;transform-origin:160px 100px"/>
    ${text(160, 184, 'in for four · out for six · the hole is new', 10)}`),
  punch: () => svg('A low runner under the branches, finishing in the fairway', `
    <path d="M100 20 q30 40 0 70 M130 10 q20 40 10 60 M70 30 q30 30 20 60" fill="none" stroke="${TURF}" stroke-width="1.6"/>
    <line x1="20" y1="160" x2="300" y2="160" stroke="${TURF}" stroke-width="1.4"/>
    ${golfer(40, 162)}<path d="M60 158 Q150 118 300 154" fill="none" stroke="${INK}" stroke-width="1.4" stroke-dasharray="4 4"/>
    ${ball(60, 158, 'da-fly', '--mx:110px;--my:-32px;--dx:236px;--dy:-4px;--dur:2.2s')}
    ${line(60, 110, 300, 110, 1, 'var(--flag)')}${text(180, 104, 'head height', 10, 'middle', 'var(--flag)')}`),
  numbers: () => svg('A yardage card: a number a club', `
    ${card(90, 30, 140, 140, ['SW   78', 'GW   92', 'PW  108', '9i   120', '8i   132'])}
    ${text(160, 190, 'measured, averaged, written down', 10)}`),
  partner: () => svg('Two pairs on the putting green, better ball', `
    ${green(160, 100, 130, 70)}${hole(230, 96)}
    ${ball(70, 110, 'da-roll', '--dx:150px;--dur:2.4s')}${ball(90, 70, 'da-roll', '--dx:134px;--dy:26px;--dur:2.4s;--d:1.4s')}
    <path d="M60 150 l-6 -18 M70 150 l6 -18 M80 60 l-6 -18 M90 60 l6 -18" fill="none" stroke="${INK}" stroke-width="1.6"/>
    ${text(160, 184, 'who putts first? the first putt shows the second', 10)}`),
  safeball: () => svg('One partner in the trees, the other playing to the middle of the green', `
    ${green(240, 90, 60, 36)}${hole(240, 90)}${flag(262, 74)}
    <path d="M40 40 q20 30 0 60 M60 30 q25 30 10 70" fill="none" stroke="${TURF}" stroke-width="1.6"/>
    ${ball(52, 70)}${text(52, 110, 'partner: gone', 10)}
    ${golfer(120, 196)}${ball(138, 192, 'da-fly', '--mx:50px;--my:-110px;--dx:102px;--dy:-102px;--dur:2.4s')}
    ${text(170, 150, 'you: the middle', 10)}`),
  pressure: () => svg('A three-foot putt, twenty-five times in a row', `
    ${green(160, 110, 140, 56)}${hole(220, 108)}${tee(130, 100)}
    ${putter(90, 118)}${ball(130, 113, 'da-roll', '--dx:84px;--dur:1.6s')}
    ${card(236, 150, 64, 36, ['24 / 25'])}${text(160, 50, 'miss, and it is nought again', 10)}`),
  warmup: () => svg('The warm-up in order: putting, chipping, the range, the first tee', `
    ${[['putt', 50], ['chip', 125], ['range', 200], ['1st tee', 275]].map(([l, x], i) => `<rect x="${x - 28}" y="70" width="56" height="48" rx="8" fill="${i === 3 ? GREEN : '#FBFAF7'}" stroke="${INK}" stroke-width="1.4" class="da-pulse" style="--d:${i * 0.5}s"/>` + text(x, 92, ['5 min', '5 min', '8 min', 'go'][i], 11, 'middle', INK) + text(x, 108, l, 10)).join('')}
    ${line(80, 94, 95, 94, 1.4, TURF)}${line(155, 94, 170, 94, 1.4, TURF)}${line(230, 94, 245, 94, 1.4, TURF)}
    ${text(160, 160, 'green first, driver last', 11, 'middle', INK)}`),
  mirror: () => svg('A golfer at address in front of a mirror', `
    <rect x="190" y="30" width="100" height="150" rx="6" fill="#F3F1EA" stroke="${INK}" stroke-width="1.6"/>
    ${golfer(110, 180)}<g opacity=".55">${golfer(240, 180)}</g>
    ${text(240, 196, 'the mirror', 10)}${text(110, 196, 'two knuckles · hips back · arms hang', 10)}`),
};
export function art(key) { const f = ART[key]; return f ? f() : ''; }
export const ART_KEYS = Object.keys(ART);
