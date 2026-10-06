/* Competition rules. Band 15 receives 15 strokes (stroke index 1–15),
   band 20 receives 20 (one a hole, two on SI 1–2), band 25 receives 25
   (one a hole, two on SI 1–7), band 30 receives 30 (one a hole, two on
   SI 1–12). The band IS the total strokes received. */

export const RULES = [
  { id: 'pairs', name: 'Team Competition', tag: 'The main event. Fixed pairs, better ball, net.',
    when: 'Rounds 1–3 (Thu, Fri, Sun). Sunday is the final.',
    won: 'Lowest cumulative net score to par across the three counting rounds.',
    body: [
      'You and your partner each play your own ball on every hole. Both of you write down a net score — your gross minus any handicap strokes your band receives on that hole. Whichever of the two net scores is lower becomes the pair’s score for the hole. The other one is thrown away.',
      'The pair’s scores add up across Thursday, Friday and Sunday. Tuesday’s practice round feeds nothing.',
      'Tie: shared until the final; a tie after Sunday is settled by the better Sunday round, then the back nine.',
    ],
    example: 'Hole 7, par 5, stroke index 3. Norberto III (band 20) takes 6 gross, receives 1 stroke: net 5. Norberto Jr. (band 25) takes 7 gross, receives 2 strokes: net 5. The pair scores 5 — level par.' },

  { id: 'mvp', name: 'Tournament MVP', tag: 'Your own ball, your own number. Every stroke counts.',
    when: 'Rounds 1–3, cumulative.',
    won: 'Lowest individual net score to par across the three counting rounds.',
    body: [
      'The same scorecard that feeds the Team Competition feeds this — nothing extra to enter. Your net score on every hole counts, whether or not your partner beat it.',
      'It runs independently of the pairs: you can carry your pair and lose the MVP, or ride your partner all week and win it.',
      'Tie: better Sunday round, then the back nine.',
    ],
    example: 'Manuel P plays off band 25, so he receives 25 strokes across the round. A 92 gross on Thursday is net 67 — five under a par 72. That is his MVP number for the day regardless of what Matt D scored.' },

  { id: 'bbb', name: 'Bingo Bango Bongo', tag: 'Three points a hole for being first, closest, and done.',
    when: 'Rounds 1–3. 54 points a round, 162 in all.',
    won: 'Most points banked individually across the three counting rounds.',
    body: [
      'Every hole has three points. Bingo: first ball on the green. Bango: once everyone is on, closest to the hole. Bongo: first ball in the cup.',
      'Points are banked by the individual, not the pair. Order of play matters — play ready golf and honours honestly, because the point rewards position, not skill.',
      'The scorer taps three names per hole on the score entry screen. Nothing is derived; what they tap is the record.',
      'Tie: shared points stand; a tie on the final total splits any prize.',
    ],
    example: 'Hole 11, par 3. Gabriel P is on the green first: Bingo. All four on — Ray V is closest: Bango. Robby B holes a 20-footer first: Bongo. One point each.' },

  { id: 'ctp', name: 'Closest to the Pin', tag: 'One nominated par 3 per round. One shot, one winner.',
    when: 'One hole per counting round, nominated before play.',
    won: 'The tee shot finishing nearest the hole, on the green, wins the round’s prize.',
    body: [
      'The hole is nominated before the round starts — it appears on the round header and the score entry screen. Only tee shots that finish on the green count.',
      'The marker measures and records name and distance. Later groups beat the standing mark or leave it.',
      'Tie: nearest first-recorded mark stands; an exact tie shares the prize.',
    ],
    example: 'Friday, nominated hole 11. Duncan W sticks it to 2.4 m and nobody beats it: Duncan takes Friday’s pin.' },

  { id: 'ld', name: 'Longest Drive', tag: 'One nominated hole per round. Furthest ball in the fairway.',
    when: 'One hole per counting round, nominated before play.',
    won: 'The longest drive finishing in the fairway wins the round’s prize.',
    body: [
      'A long, open hole is nominated before the round. Only drives finishing in the fairway count — the rough does not pay.',
      'A marker walks out with the current leader’s name on it. Beat it and the marker moves.',
      'Tie: measured again; a true tie shares the prize.',
    ],
    example: 'Thursday, nominated hole 16. DP finds the fairway at 260 m; Devin O goes past him but into the rough. DP keeps the marker.' },

  { id: 'ryder', name: 'Ryder Cup — UK vs USA', tag: 'Squad match play laid over the same scorecards. No extra golf.',
    when: 'Singles all three sessions — Thursday, Friday and Sunday.',
    won: 'Most match points across the three sessions. One point per match, half each if all square.',
    body: [
      'Every golfer belongs to a squad — UK or USA — set on the Ryder Cup screen. The matches are scored off the identical cards that feed everything else. No extra golf, no separate card.',
      'Every session is head-to-head net singles: one UK golfer against one USA golfer, hole by hole, match play. Thursday and Friday run alongside the Better Ball rounds; Sunday runs alongside the championship final. You play your own ball in the cup whatever the day’s team format is.',
      'A hole is won like this. Take the gross. Cap it at triple bogey first — a blow-up hole counts as par plus three and no worse. Then take off the strokes your band gives on that hole’s stroke index. Lower net takes the hole; equal nets halve it. Tap the result on any match to see that working, hole by hole.',
      'The match closes the moment the lead is bigger than the holes left — that is what “3&2” means, three up with two to play. Otherwise it runs to the 18th. Win the match and your squad takes a point; all square after eighteen and it is half each. A match still on the course is worth nothing yet, which is why the boards say how many are still out.',
      'With four a side that is four matches a session and twelve points across the week, so six and a half wins the cup. The draw is redrawn each session, so you do not meet the same opponent twice. If the squads are uneven, the bigger squad rotates: whoever sits out on Thursday is in on Friday, and everyone plays at least twice.',
      'STROKES ARE NOT THE CUP. The cup is points and only points. Two squads’ scoring averages settle no match and win no point — a man can go round in 84 and still take his match, and a man can play beautifully and lose it one down. Strokes decide the Team Competition and the MVP; holes decide this.',
      'Your pairing has no bearing on it either. The draw is built from squads, never from pairs — which means a mixed pair can be drawn against each other, playing better ball together and singles against each other on the same eighteen holes. Shooting your own lowest score still serves both.',
      'Match play notation: “2 up” means two holes ahead with holes left. “All square” is level. “Dormie” is up by exactly the number left.',
      'Tie: if the cup finishes level, it is shared — and argued about at Mandatory Team Beers.',
    ],
    example: 'Thursday singles, hole 9 at Olympos — par 4, stroke index 5. Duncan W plays off band 25 and receives two strokes there; Ray V plays off band 20 and receives one. Duncan takes 6 gross, net 4. Ray takes 5 gross, net 4. The hole is halved, and the five gross beat the six for nothing. Duncan closes the match 3&2 on the 16th: one point to the United Kingdom.' },
];

export const RELIEF = {
  title: 'Relief rules — apply to every competition',
  items: [
    { name: 'Triple bogey maximum', body: 'No hole can score worse than triple bogey. At the cap you pick up and take it — the card shows the hole as capped, not silently trimmed. The cap applies to the gross score before handicap strokes. The commissioner can change the cap in Setup.' },
    { name: 'Breakfast ball', body: 'One free re-tee on hole 1, every round including Sunday. The re-hit does not count and does not come out of the mulligan allowance.' },
    { name: 'Mulligans — one per nine', body: 'Two a round: one on the front nine, one on the back. Not transferable between nines.' },
    { name: 'Sunday is different', body: 'The championship final has no mulligans at all. The breakfast ball on hole 1 is retained.' },
  ],
  bands: [
    ['Band 15', 'One stroke on stroke index 1–15. Fifteen strokes in all.'],
    ['Band 20', 'One stroke on every hole, a second on stroke index 1–2. Twenty strokes in all.'],
    ['Band 25', 'One stroke on every hole, a second on stroke index 1–7. Twenty-five strokes in all.'],
    ['Band 30', 'One stroke on every hole, a second on stroke index 1–12. Thirty strokes in all.'],
  ],
  /* Tuesday is the audition. Said here because a band is the one thing a
     golfer picks for himself and the one thing that decides every figure he
     is measured by all week. */
  bandNote: 'Pick your own band for Tuesday. The practice round is scored gross and feeds nothing, so it '
    + 'costs you nothing to be wrong — and the Practice Day board reads every card back and says whether the '
    + 'band you chose is the one you should take into Thursday. A scorer settles them before Round 1, and '
    + 'after that they are fixed for the week.',
  stableford: [['Double bogey or worse','0'],['Bogey','1'],['Par','2'],['Birdie','3'],['Eagle','4'],['Albatross','5']],
};
