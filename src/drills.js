/* The Union Invitational — the practice manual.
 *
 * A library of drills a club golfer can run on a putting green, a range,
 * a quiet nine or a living-room carpet, and the rule that picks a dozen
 * or so for each golfer from the grades on their report card: the weakest
 * department gets the most, everybody gets the fundamentals. Every drill
 * carries a drawing (src/drillart.js), a way of scoring it, a target for a
 * 15-to-30 handicap, a way to make it harder, and a coach on video.
 *
 * The words are the book's own. The videos are links to the coaches who
 * teach these drills on YouTube; nothing of theirs is copied here. Every
 * link was checked public on VIDEOS_CHECKED (tools/videos-check.mjs runs
 * the same check again, from a machine that can reach YouTube).
 */
export const VIDEOS_CHECKED = '2026-11-08';
import * as E from './engine.js';

/* the departments the report card grades, in the order they read */
export const DEPTS = [['putting', 'Putting'], ['par3', 'Par-3 play'], ['par4', 'Par-4 play'], ['par5', 'Par-5 play'], ['composure', 'Composure'], ['consistency', 'Consistency'], ['team', 'Team contribution']];
export const AREAS = { putt: 'Putting green', short: 'Chipping green', bunker: 'Practice bunker', range: 'Range', course: 'On the course', home: 'At home' };

/* ---------------- the library ----------------
   dept: the departments a drill serves, first the one it serves most.
   where: putt | short | bunker | range | course | home.  mins: a session.  */
export const DRILLS = [
  /* ---- putting ---- */
  { id: 'gate', name: 'The gate', dept: ['putting', 'team'], where: 'putt', mins: 10, kit: 'Two tees, three balls', art: 'gate',
    why: 'A three-footer missed is a point handed back. The gate makes the putter face square at impact, every time, without thinking about it.',
    setup: ['Find a flat three-foot putt.', 'Push two tees into the green just wider than the putter head, a putter-length from the hole, so the head passes through with a coin’s width each side.'],
    steps: ['Set up square to the gate, not the hole.', 'Make the stroke; the head passes through the gate without touching a tee.', 'Hold the finish and watch the ball in.'],
    score: 'Out of 10: a putt counts only if the head clears both tees and the ball goes in.', target: '8 of 10 to begin with, 10 of 10 before you leave.', harder: 'Narrow the gate a coin’s width. Then move to a putt with a foot of break and keep the gate square to the start line.',
    video: { who: 'Phil Kenyon', title: 'The putting gate, with Phil Kenyon (Visio Putting)', url: 'https://www.youtube.com/watch?v=v7o1uK26dcQ' } },
  { id: 'clock', name: 'Around the clock', dept: ['putting', 'composure'], where: 'putt', mins: 15, kit: 'Twelve balls', art: 'clock',
    why: 'Short putts from every side of the hole, with the break changing each time, are the putts that decide a four-ball.',
    setup: ['Lay twelve balls in a circle three feet from the hole, like the hours on a clock.'],
    steps: ['Start at twelve and go round, one putt a ball.', 'Miss one and the circle starts again from twelve.', 'Clear the circle, move every ball out to four feet, and go again.'],
    score: 'How far out the circle gets before the session ends: three, four, five feet.', target: 'Clear three feet every session. Five feet is a very good day.', harder: 'Clear two circles in a row before moving out.',
    video: { who: 'Jon Rahm', title: 'The “around the world” putting drill', url: 'https://www.youtube.com/watch?v=csdRCdxNNOs' } },
  { id: 'ladder', name: 'The ladder', dept: ['putting', 'consistency'], where: 'putt', mins: 15, kit: 'Four tees, five balls', art: 'ladder',
    why: 'Three-putts come from the first putt, not the second. The ladder teaches distance, which is the whole of long putting.',
    setup: ['Push tees in at 10, 20, 30 and 40 feet from where you stand, in a line.', 'Stand with five balls.'],
    steps: ['Putt the first ball to finish just past the 10-foot tee.', 'Putt the next to the 20, then the 30, then the 40. The fifth is your choice.', 'Look at the tee, not the ball, for your last practice stroke, then putt.'],
    score: 'A ball counts if it finishes within a putter-length past its tee. Out of 5.', target: '3 of 5 a round of the ladder; 5 of 5 once a session.', harder: 'Go back down the ladder, 40 to 10. Then run it on a slope.',
    video: { who: 'John Hughes Golf', title: 'Master your putting distance control with the ladder drill', url: 'https://www.youtube.com/watch?v=p21TO0WgeRo' } },
  { id: 'circle', name: 'The three-foot circle', dept: ['putting', 'par4', 'par5'], where: 'putt', mins: 10, kit: 'Four tees, ten balls', art: 'circle',
    why: 'From thirty feet the job is not to hole it. It is to leave a tap-in. A ball that dies a foot past the hole does that.',
    setup: ['Make a circle of tees three feet around the hole.', 'Drop ten balls at thirty feet, on a straight-ish putt.'],
    steps: ['Putt each ball to finish inside the circle, past the hole rather than short.', 'Count a ball short of the hole as a miss, even inside the circle.'],
    score: 'Balls inside the circle and past the hole, out of 10.', target: '6 of 10. A tour player makes 8.', harder: 'Forty feet. Then fifty, where the circle is still three feet.',
    video: { who: 'Dave Pelz', title: 'The 3-foot putting circle drill (Golf Life)', url: 'https://www.youtube.com/watch?v=IukApU3-Uys' } },
  { id: 'threesixnine', name: 'Three, six, nine', dept: ['putting', 'composure'], where: 'putt', mins: 10, kit: 'Three balls, three tees', art: 'threesixnine',
    why: 'The pressure putt is the last one. This drill ends on it every time, so the last one becomes ordinary.',
    setup: ['Tee at three, six and nine feet on the same line.'],
    steps: ['Hole three in a row from three feet.', 'Then three in a row from six.', 'Then three in a row from nine. A miss at any stage sends you back to three feet.'],
    score: 'How many attempts it takes to finish the set.', target: 'Finish it inside fifteen minutes.', harder: 'Four in a row at each station. Then make the nine-footer break.',
    video: { who: 'Golf Insider', title: '3, 6, 9-feet putting drill', url: 'https://www.youtube.com/watch?v=jEpMLvKLYeY' } },
  { id: 'eyes', name: 'Eyes on the hole', dept: ['putting'], where: 'putt', mins: 10, kit: 'Ten balls', art: 'eyes',
    why: 'Looking at the hole while you putt switches off the hands and lets the eyes set the speed. Feel, not mechanics.',
    setup: ['Ten balls at fifteen feet.'],
    steps: ['Take your setup, then turn your head to the hole and keep it there.', 'Putt while looking at the hole.', 'Notice how close the speed is. Then putt the next ball normally and keep that speed.'],
    score: 'Balls that finish within two feet, out of 10, with eyes on the hole.', target: '7 of 10.', harder: 'Twenty-five feet. Then putt with eyes closed after one look.',
    video: { who: 'Brad Faxon', title: 'Putting distance control', url: 'https://www.youtube.com/watch?v=lKWhls8aFpU' } },

  /* ---- the short game ---- */
  { id: 'updown', name: 'Nine up-and-downs', dept: ['composure', 'par4', 'par3'], where: 'short', mins: 20, kit: 'One ball, a wedge, a putter', art: 'updown',
    why: 'Composure is a chip to four feet after a bad shot. This is nine bad shots in a row and nine chances to tidy them up.',
    setup: ['Drop one ball in nine different spots round the chipping green: rough, fringe, a tight lie, a downhill, a long one.', 'One ball each time, never two.'],
    steps: ['Chip, then putt out. Count every shot.', 'Two is an up-and-down. Three is a bogey. Four is what we are trying to stop.'],
    score: 'Up-and-downs out of 9, and the total strokes.', target: '4 of 9, and never worse than 22 strokes.', harder: 'Make every lie one you dislike. Play it with the ball above or below your feet.',
    video: { who: 'Dave Phillips, for Titleist', title: 'Short game practice: can you shoot 21?', url: 'https://www.youtube.com/watch?v=vjXAIwK6NTs' } },
  { id: 'towel', name: 'The landing towel', dept: ['par3', 'par4', 'composure'], where: 'short', mins: 15, kit: 'A towel, ten balls, a wedge', art: 'towel',
    why: 'A chip has one job: land on the spot. Everything after that is the green’s. The towel teaches you to pick the spot and hit it.',
    setup: ['Lay a towel on the green a few paces on, on the line to the hole.', 'Ten balls from the fringe.'],
    steps: ['Land every ball on the towel and let it run.', 'Move the towel nearer and further; use less loft when it is near, more when far.'],
    score: 'Balls that land on the towel, out of 10.', target: '5 of 10 with one club, from three different distances.', harder: 'Fold the towel in half. Then in half again.',
    video: { who: 'Danny Maude', title: 'Before chipping onto the green do this simple drill', url: 'https://www.youtube.com/watch?v=TNSsIhza25o' } },
  { id: 'clockface', name: 'The clock-face wedge', dept: ['par3', 'par5', 'consistency'], where: 'short', mins: 20, kit: 'One wedge, fifteen balls', art: 'clockface',
    why: 'Three swing lengths with one club give you three distances you can trust. That is a par-5 lay-up and a par-3 miss sorted.',
    setup: ['Picture your lead arm as the hour hand. Three backswings: 7:30, 9:00 and 10:30.'],
    steps: ['Five balls at each length, same tempo, finish the same every time.', 'Pace the carry of each group and write the three numbers on a card in your bag.'],
    score: 'How tight each group is: all five inside five yards is a pass.', target: 'Three numbers you believe. For most of this field: about 30, 50 and 70 yards with a sand wedge.', harder: 'Do it with the gap wedge and the pitching wedge. That is nine numbers.',
    video: { who: 'Dave Pelz', title: 'Pelz Corner: wedge distance control', url: 'https://www.youtube.com/watch?v=BuJklZJbLlg' } },
  { id: 'bunker', name: 'The line in the sand', dept: ['composure', 'par3', 'par5'], where: 'bunker', mins: 15, kit: 'Ten balls, a sand wedge', art: 'bunker',
    why: 'Out in one is all a bunker asks. The club has to enter the sand two inches behind the ball, and this shows you exactly where it did.',
    setup: ['Draw a straight line in the sand with the shaft.', 'Set up with the line two inches behind the ball’s position; no ball to begin with.'],
    steps: ['Swing and splash the sand from the line forwards, five times. The divot should start on the line.', 'Then place balls two inches ahead of the line and hit the line, not the ball.'],
    score: 'Divots that start on the line, out of 10. Then balls out on the green, out of 10.', target: '8 of 10 on the line; 7 of 10 on the green.', harder: 'A buried lie, with the face square and a steeper swing. Then a long bunker shot with a gap wedge.',
    video: { who: 'Brian Fitzgerald, The Golf Doctor', title: 'Bunkers: the line in the sand drill', url: 'https://www.youtube.com/watch?v=CTPNifgLpJY' } },
  { id: 'pitchladder', name: 'The pitching ladder', dept: ['par5', 'par4', 'consistency'], where: 'range', mins: 20, kit: 'Three wedges, twelve balls', art: 'pitchladder',
    why: 'The second shot on a par 5 is a lay-up to a number you like. Then the third is a number you know. This builds the numbers.',
    setup: ['Targets at 40, 60, 80 and 100 yards. Flags or towels.'],
    steps: ['Four balls at each target, nearest first, choosing the club and the swing length for each.', 'A ball counts if it finishes inside ten yards of the target.'],
    score: 'Out of 16.', target: '9 of 16. Then 12.', harder: 'Mix the order so no two balls go to the same target in a row.',
    video: { who: 'iGolftv', title: 'Wedge control: the 20-40-60-80-100 yard drill', url: 'https://www.youtube.com/watch?v=uq9YjxVBnZk' } },
  { id: 'par18', name: 'Par 18', dept: ['composure', 'par3', 'team'], where: 'short', mins: 25, kit: 'One ball, a wedge, a putter', art: 'par18',
    why: 'Nine holes of short game, par 2 each. A game with a score beats a bucket of chips, because you keep the score.',
    setup: ['Pick nine spots round the green, each a different shot. Each is a par 2: chip, putt.'],
    steps: ['Play all nine, one ball, holing everything out.', 'Write the score down. Beat it next time.'],
    score: 'Strokes for nine holes, against par 18.', target: '24 or better. Tour players play these at about 19.', harder: 'Play it with a partner, alternate shot: you chip, they putt, then swap.',
    video: { who: 'Golf Insider', title: 'Golf chipping skills game: Par 18', url: 'https://www.youtube.com/watch?v=vhlOcJibpig' } },

  /* ---- the long game ---- */
  { id: 'sticks', name: 'The alignment station', dept: ['consistency', 'par4', 'par3'], where: 'range', mins: 10, kit: 'Two alignment sticks', art: 'sticks',
    why: 'Most shots that start wrong were aimed wrong. Ten minutes a session with the sticks and the body learns what square looks like.',
    setup: ['One stick on the ground along the target line, a foot outside the ball.', 'One parallel to it along your toes.'],
    steps: ['Set up to the toe stick every ball for the first twenty balls of every session.', 'Check ball position against the toe stick: a tee’s width forward of centre for a mid iron, inside the lead heel for the driver.'],
    score: 'None. It is a habit, not a test.', target: 'Twenty balls a session, every session.', harder: 'Take the sticks away for ten balls and lay a club down to check you kept it.',
    video: { who: 'Rick Shiels', title: 'Help with your alignment', url: 'https://www.youtube.com/watch?v=z_PlY9OemuM' } },
  { id: 'teegate', name: 'The tee gate', dept: ['par4', 'consistency', 'par5'], where: 'range', mins: 15, kit: 'Two tees, twenty balls, a 7-iron', art: 'teegate',
    why: 'A strike from the middle of the face goes the distance you expect. One from the heel or toe does not, and that is most of the doubles.',
    setup: ['Push a tee in just outside the toe of the club at address, and one just inside the heel, a coin’s width wider than the face.'],
    steps: ['Hit through the gate without touching a tee. Start at half speed.', 'Build to a full swing only while the gate stays clean.'],
    score: 'Clean swings out of 20.', target: '14 of 20 at full speed.', harder: 'Spray the face with foot powder and aim for a mark inside a coin of the centre.',
    video: { who: 'Chris Ryan', title: '3 awesome drills to improve your strike', url: 'https://www.youtube.com/watch?v=kBDdKmg8UYQ' } },
  { id: 'tempo', name: 'Three to one', dept: ['consistency', 'composure', 'par4'], where: 'range', mins: 10, kit: 'A metronome app, ten balls', art: 'tempo',
    why: 'Under pressure a swing gets quick going back. Good swings take three counts back and one through, and a count you can hear keeps it that way on the 18th tee.',
    setup: ['A metronome at 60 beats a minute, or count “one-two-three” back and “one” through.'],
    steps: ['Start the backswing on a beat and strike on the fourth.', 'Ten balls with a short iron. Then ten with the driver, same count.'],
    score: 'Balls where the strike lands on the beat, out of 10.', target: '8 of 10 with the driver.', harder: 'Take the metronome away and have a partner count.',
    video: { who: 'Tour Tempo, on GForce Golf', title: 'The 3-to-1 rule', url: 'https://www.youtube.com/watch?v=V-8UIPxsJiQ' } },
  { id: 'feet', name: 'Feet together', dept: ['consistency', 'composure'], where: 'range', mins: 10, kit: 'Ten balls, a 7-iron', art: 'feet',
    why: 'Balance is the first thing to go when you try to hit it hard. With the feet together the arms have to swing and the body has to stay quiet.',
    setup: ['Feet touching, ball in the middle, a 7-iron.'],
    steps: ['Swing three-quarters and hold the finish for three seconds.', 'If you stumble, the swing was too hard. Ten balls, then ten with your normal stance keeping the same feeling.'],
    score: 'Finishes held for three seconds, out of 10.', target: '9 of 10.', harder: 'Same drill with a hybrid. Then on a slight slope.',
    video: { who: 'The DIY Golfer', title: 'Feet together drill: fix your tempo and balance', url: 'https://www.youtube.com/watch?v=0lhtR2Qqhlg' } },
  { id: 'heights', name: 'Three heights', dept: ['par3', 'composure', 'par4'], where: 'range', mins: 15, kit: 'Fifteen balls, a 7-iron', art: 'heights',
    why: 'A par 3 into the wind, a tree in the way, a tucked flag: each wants a different height. Owning three flights turns trouble into a shot.',
    setup: ['Same club, same target.', 'Low: ball back, hands ahead, finish short. Normal. High: ball forward, full finish.'],
    steps: ['Five of each, calling the height before you swing.', 'A ball counts if it flew the height you called and finished within twenty yards.'],
    score: 'Out of 15.', target: '9 of 15.', harder: 'Mix them: low, high, normal, high, low. Then do it with a hybrid.',
    video: { who: 'Scratch Golf Academy', title: 'How to hit high and low trajectory shots with control', url: 'https://www.youtube.com/watch?v=-XQI1A7MW38' } },
  { id: 'fairway', name: 'The fairway finder', dept: ['par4', 'par5', 'composure'], where: 'range', mins: 15, kit: 'Ten balls, the driver and a 3-wood', art: 'fairway',
    why: 'Out of bounds costs two shots before you have moved. A shot you can keep in play from the tee, at four-fifths, is worth more than ten extra yards.',
    setup: ['Pick two targets on the range forty yards apart: that is a fairway.', 'Tee the ball a little lower than usual.'],
    steps: ['Ten drives at four-fifths speed with a full finish. Count the ones between the targets.', 'Then five with the 3-wood. Compare.'],
    score: 'Fairways out of 10 with the driver, out of 5 with the 3-wood.', target: '7 of 10. If the 3-wood scores better, it is the club on tight holes.', harder: 'Thirty yards wide. Then pick the side you must miss on and count only those.',
    video: { who: 'Golf Distillery', title: 'How to turn your driver into a fairway finder', url: 'https://www.youtube.com/watch?v=E4sWBHQs44Y' } },
  { id: 'towelback', name: 'The towel behind the ball', dept: ['par5', 'par4', 'consistency'], where: 'range', mins: 15, kit: 'A towel, fifteen balls, a hybrid and a mid iron', art: 'towelback',
    why: 'A fat hybrid on a par 5 is a stroke gone. The low point of the swing has to be past the ball; the towel tells you at once if it was not.',
    setup: ['Fold a towel and lay it six inches behind the ball.'],
    steps: ['Hit the ball without touching the towel. Weight into the lead side at the top of the downswing.', 'Five with a 7-iron, five with a hybrid, five with a 3-wood off the grass.'],
    score: 'Clean strikes out of 15.', target: '11 of 15.', harder: 'Four inches. Then off a slightly downhill lie.',
    video: { who: 'Ryan Trengrove, Swing Safe Golf', title: 'Towel behind the ball drill for strike point', url: 'https://www.youtube.com/watch?v=Xi8VbNN6Q8s' } },

  /* ---- the course and the head ---- */
  { id: 'routine', name: 'The twenty-second routine', dept: ['composure', 'consistency', 'team'], where: 'course', mins: 0, kit: 'A phone to film it, once', art: 'routine',
    why: 'The same routine before every shot gives a nervous swing somewhere to live. Twenty seconds, always the same, from the decision to the strike.',
    setup: ['Write your routine down: club decided, one look at the target from behind, one rehearsal, walk in, two looks, go.'],
    steps: ['Film yourself on the range doing it five times. Time it. It should be within two seconds every time.', 'On the course, if anything interrupts it, step away and start it again.'],
    score: 'Shots this round where you did the whole routine. Mark the card.', target: 'Every shot by round two. Honestly.', harder: 'Do it on the putting green too, down to a twelve-second putting routine.',
    video: { who: 'Rick Shiels', title: 'The perfect golf pre-shot routine', url: 'https://www.youtube.com/watch?v=vaTEBm33_Yo' } },
  { id: 'worstball', name: 'Worst ball', dept: ['consistency', 'composure', 'team'], where: 'course', mins: 120, kit: 'Two balls, a quiet nine', art: 'worstball',
    why: 'Play two balls and always take the worse one. Nine holes of this and your bad shot gets better, because it is the only one that counts.',
    setup: ['A quiet nine, two balls, no one behind you.'],
    steps: ['Hit two tee shots. Play two from the worse one. Keep playing from the worse of each pair, including putts.', 'Hole out both; the worse score counts.'],
    score: 'Nine holes of worst ball against your handicap.', target: 'Within eight shots of your usual nine.', harder: 'Best ball on the front nine, worst ball on the back, and compare the two scores.',
    video: { who: 'Jonesy Golf', title: 'On-course pressure training with two-ball worse ball', url: 'https://www.youtube.com/watch?v=C5-g2PLD1cg' } },
  { id: 'bogey', name: 'No worse than bogey', dept: ['composure', 'par4', 'par5', 'team'], where: 'course', mins: 120, kit: 'Nine holes', art: 'bogey',
    why: 'In a four-ball a bogey keeps you in the hole and a double never counts. Play nine with one rule and it changes which club you pull.',
    setup: ['Nine holes. The only aim: no hole worse than bogey.'],
    steps: ['On every tee ask what keeps a double off the card: often it is the 3-wood or the hybrid.', 'Short-side nothing. Aim at the fat of every green. Lay up to the wedge number you know.'],
    score: 'Holes without a double, out of 9.', target: '8 of 9. Count how many pars came along by themselves.', harder: 'No worse than bogey over eighteen, with a partner keeping you honest.',
    video: { who: 'Cordie Walker, GolfWell', title: 'This simple strategy eliminates double bogeys', url: 'https://www.youtube.com/watch?v=P3crhrkbp3g' } },
  { id: 'centergreen', name: 'Middle of the green', dept: ['par3', 'par4'], where: 'range', mins: 15, kit: 'Ten balls, the clubs you hit from 130 to 170', art: 'centergreen',
    why: 'The flag on a par 3 is a suggestion. The middle of the green is the target, and from there the worst you make is a two-putt par.',
    setup: ['Pick a green on the range. Ignore the flag; find its middle.'],
    steps: ['Ten shots at the middle with the club for that distance, teed low as on a par 3.', 'Count the ones on the green. Not the ones near the flag: on the green.'],
    score: 'Greens out of 10.', target: '6 of 10 from 150. If it is below 4, take one more club.', harder: 'Five with one more club at a smooth swing. Compare the count. That answer is your par-3 club.',
    video: { who: 'Toptracer', title: 'How to hit more greens on par 3s', url: 'https://www.youtube.com/watch?v=51L0BXq2Mcs' } },
  { id: 'reset', name: 'The ten-second reset', dept: ['composure', 'team', 'consistency'], where: 'course', mins: 0, kit: 'Nothing', art: 'reset',
    why: 'A bad shot is a shot. Two bad shots are a hole. The reset is what happens in the ten seconds between them.',
    setup: ['Pick a trigger: the velcro on the glove, a tee in the pocket, the club going back in the bag.'],
    steps: ['After a bad shot: one breath in for four, out for six. Say what you will do next, in words. Then the trigger, and the hole is new.', 'Allow yourself nothing else about the shot until the round is over.'],
    score: 'Bad shots followed by a good one this round. Mark the card: a dot for each reset that worked.', target: 'Two out of three.', harder: 'Do it after good shots too, so the routine does not depend on the mood.',
    video: { who: 'Me and My Golf', title: 'What to do after a bad shot', url: 'https://www.youtube.com/watch?v=n0YWwVCI524' } },
  { id: 'punch', name: 'The escape shot', dept: ['composure', 'par4', 'par5'], where: 'range', mins: 10, kit: 'Ten balls, a 7-iron', art: 'punch',
    why: 'Out of the trees the hero shot costs a double. The hundred-yard runner that finds the fairway costs nothing, and it has to be rehearsed before you need it.',
    setup: ['Ball back in the stance, hands ahead, grip down an inch, a 7-iron.'],
    steps: ['Half swing, finish low with the hands below the shoulders. The ball runs out at a hundred yards, under head height.', 'Ten balls to a target a hundred yards out, twenty yards wide.'],
    score: 'Balls in the target, under head height, out of 10.', target: '7 of 10.', harder: 'From a bad lie: a divot, pine needles, a downslope.',
    video: { who: 'Mark Wood Golf Academy', title: 'The low punch shot', url: 'https://www.youtube.com/watch?v=h8mKk6M76x4' } },
  { id: 'numbers', name: 'Know your numbers', dept: ['par5', 'par3', 'consistency'], where: 'range', mins: 20, kit: 'Thirty balls, every wedge and a card', art: 'numbers',
    why: 'A lay-up to a number you have measured beats a lay-up to a number you hope. This session writes the card you play from.',
    setup: ['A rangefinder or the range’s markers.', 'A card in your bag with a column a club.'],
    steps: ['Ten full shots with each wedge. Throw out the longest and the shortest, average the rest.', 'Write the carry on the card. Do the same for the 9 and the 8.'],
    score: 'A card with a number a club.', target: 'Numbers you would lay up to. Check them again in a month.', harder: 'Add the three-quarter swing a club, so every club has two numbers.',
    video: { who: 'Joanna Coe, for Titleist', title: 'How to find your stock yardages', url: 'https://www.youtube.com/watch?v=a-BJyJz67uA' } },

  /* ---- the team game ---- */
  { id: 'partner', name: 'Two-on-two putting', dept: ['team', 'putting', 'composure'], where: 'putt', mins: 20, kit: 'Four golfers, four balls', art: 'partner',
    why: 'Four-ball is a putting game with a partner watching. Practise it as one: the pressure of the pair, and the putts that count.',
    setup: ['Two pairs, nine holes on the putting green, better ball, from fifteen to thirty feet.'],
    steps: ['Both partners putt. The better score counts for the pair.', 'Talk: who goes first, what the first putt shows the second. Keep the score and play for a drink.'],
    score: 'Holes won, out of 9.', target: 'Win more than you lose. Notice which partner should putt first when it matters.', harder: 'The partner who putts second must hole out or the pair takes a bogey.',
    video: { who: 'Neon City Golf', title: 'How to practise putting using games: clocks', url: 'https://www.youtube.com/watch?v=PmJhBXpTm24' } },
  { id: 'safeball', name: 'The safe ball', dept: ['team', 'composure', 'par5'], where: 'course', mins: 120, kit: 'A partner, nine holes', art: 'safeball',
    why: 'When your partner is in trouble you have one job: a par. Nine holes of playing the team shot, not your own, is the week’s most valuable practice.',
    setup: ['Nine holes of better ball with your partner.'],
    steps: ['On every shot the partner who hits second says out loud what the pair needs: “you are in play, I can go at it” or “you are gone, I play the middle”.', 'The second player makes the team shot. No heroes.'],
    score: 'Holes where the pair scored a par or better, out of 9.', target: '6 of 9.', harder: 'Swap the order on every hole so each of you plays the safe ball.',
    video: { who: 'Golf Distillery', title: 'How to play the better-ball format: rules and tactics', url: 'https://www.youtube.com/watch?v=YxYv_26JT9s' } },
  { id: 'pressure', name: 'Twenty-five in a row', dept: ['team', 'putting', 'composure'], where: 'putt', mins: 15, kit: 'One ball, a tee', art: 'pressure',
    why: 'The putt your partner needs from you is three feet with the match on it. The twenty-fifth putt in a row feels exactly like that.',
    setup: ['A straight three-footer, a tee to mark it.'],
    steps: ['Hole twenty-five in a row. Miss, and the count goes back to nought.', 'Same routine on every one, including the first.'],
    score: 'The longest run of the session.', target: 'Twenty-five, once a week.', harder: 'Fifty. Then twenty-five from four feet.',
    video: { who: 'Joe Hallett, for Titleist', title: 'The 3-foot putting system every golfer needs to know', url: 'https://www.youtube.com/watch?v=eEfSKcvi4e4' } },

  /* ---- the fundamentals ---- */
  { id: 'warmup', name: 'The twenty-minute warm-up', dept: ['fund', 'consistency', 'composure'], where: 'course', mins: 20, kit: 'Twenty minutes before the tee time', art: 'warmup',
    why: 'The first three holes of a cold golfer cost the week more than any swing fault. The order matters: green first, driver last.',
    setup: ['Arrive twenty-five minutes before the tee time, not five.'],
    steps: ['Five minutes of putting: long putts for speed, then six three-footers.', 'Five minutes of chips, to a towel.', 'Eight minutes on the range: wedge, 7-iron, hybrid, three drivers.', 'Finish by hitting the first tee shot of the day, with the club you will use, with the full routine.'],
    score: 'Did you do all four parts, in that order.', target: 'Every round of the week.', harder: 'Cut it to twelve minutes and keep all four parts.',
    video: { who: 'Rick Shiels', title: 'How to warm up before playing golf: the 5-minute session', url: 'https://www.youtube.com/watch?v=1t6HKapfmcc' } },
  { id: 'mirror', name: 'The mirror', dept: ['fund', 'consistency'], where: 'home', mins: 5, kit: 'A mirror, a club', art: 'mirror',
    why: 'Grip and posture drift all season and nobody tells you. Five minutes in front of a mirror puts them back where the summer left them.',
    setup: ['Stand in front of a mirror, down the line and face on, with a 7-iron.'],
    steps: ['Grip: two knuckles of the lead hand showing, the V of the trail hand pointing at the trail shoulder.', 'Posture: bend from the hips, knees soft, arms hanging straight down, weight on the balls of the feet.', 'Make a slow backswing to the top and check the club points at the target.'],
    score: 'None. Five minutes, three times a week.', target: 'A setup you can find with your eyes shut.', harder: 'Film it from both angles and compare with a month ago.',
    video: { who: 'Titleist', title: 'Indoor golf training: posture, with a mirror', url: 'https://www.youtube.com/watch?v=8Adhz5nrJH0' } },
];
export const drillById = id => DRILLS.find(d => d.id === id) || null;

/* ---------------- the pick ----------------
   The weakest department gets the most drills, every department graded C or
   worse gets at least one, and the two fundamentals go to everyone. Twelve
   to fifteen in all, in an order that reads: putting green first, then the
   short game, the range, then the course and the head. */
const GRADE_RANK = { D: 0, C: 1, B: 2, A: 3 };
const WHERE_ORDER = ['home', 'putt', 'short', 'bunker', 'range', 'course'];
const SHARE = [4, 3, 2, 1, 1, 1, 1];     // drills for the worst department, the next, and so on: thirteen, plus the two fundamentals
export function manualFor(pr) {
  const g = (pr && pr.grades) || {};
  const depts = DEPTS.map(([k]) => k).filter(k => g[k]).sort((a, b) => (GRADE_RANK[g[a]] - GRADE_RANK[g[b]]) || DEPTS.findIndex(d => d[0] === a) - DEPTS.findIndex(d => d[0] === b));
  const picked = new Set(['warmup', 'mirror']);
  const want = {};
  depts.forEach((k, i) => { want[k] = SHARE[i] || 1; });
  /* each department in turn takes the drills that serve it most, then the ones that serve it at all */
  for (const k of depts) {
    let n = 0;
    for (const pass of [0, 1]) for (const d of DRILLS) {
      if (n >= want[k] || picked.has(d.id)) continue;
      if (pass === 0 ? d.dept[0] === k : d.dept.includes(k)) { picked.add(d.id); n++; }
    }
  }
  /* fill to twelve from the departments in order of need; never past fifteen */
  for (const k of depts) for (const d of DRILLS) if (picked.size < 12 && !picked.has(d.id) && d.dept.includes(k)) picked.add(d.id);
  for (const d of DRILLS) if (picked.size < 12 && !picked.has(d.id)) picked.add(d.id);
  const list = DRILLS.filter(d => picked.has(d.id)).slice(0, 15);
  /* the green first, then the short game, the range, the course; the two fundamentals close */
  const order = d => (d.dept[0] === 'fund' ? 99 : WHERE_ORDER.indexOf(d.where));
  list.sort((a, b) => order(a) - order(b) || DRILLS.indexOf(a) - DRILLS.indexOf(b));
  /* why this one: the department it was picked for, and the grade */
  return list.map(d => { const k = d.dept[0] === 'fund' ? 'fund' : (d.dept.find(x => depts.includes(x)) || d.dept[0]); return { ...d, forDept: k === 'fund' ? null : k, forGrade: k === 'fund' ? null : g[k] || null }; });
}
/** The manual as a week: four sessions, each a place and the drills for it. */
export function weekPlan(list) {
  const by = w => list.filter(d => d.where === w);
  const sessions = [
    { name: 'Session 1 · the putting green', mins: 0, drills: by('putt') },
    { name: 'Session 2 · the short game', mins: 0, drills: by('short').concat(by('bunker')) },
    { name: 'Session 3 · the range', mins: 0, drills: by('range') },
    { name: 'Session 4 · a quiet nine', mins: 0, drills: by('course').filter(d => d.mins >= 60) },
    { name: 'Every day', mins: 0, drills: by('home').concat(by('course').filter(d => d.mins < 60)) },
  ].filter(s => s.drills.length);
  for (const s of sessions) s.mins = s.drills.reduce((a, d) => a + d.mins, 0);
  return sessions;
}
export const deptLabel = k => (DEPTS.find(d => d[0] === k) || [])[1] || (k === 'fund' ? 'Fundamentals' : k);
