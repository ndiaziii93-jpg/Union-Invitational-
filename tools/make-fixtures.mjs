/* The database snapshots the tests read, built from the book's own defaults.
 *
 * These used to live in the session scratchpad, which is wiped when the
 * container restarts — so a restart silently disabled five tests, and the
 * suite went on reporting twenty-one passes as though that were the whole
 * of it. A fixture a test cannot find is not a fixture.
 *
 * So they are generated here, committed, and reproducible: run this and the
 * same bytes come out. Nothing in them is anyone's real data.
 *
 * NEVER PASTE A LIVE SNAPSHOT IN HERE. The config document carries `pins`.
 * The factory PINs are already public — they are in src/store.js — but a
 * snapshot taken after the real ones are set would put them in a public
 * repository for ever. If you need the live shape, generate it.
 *
 * Run: node tools/make-fixtures.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig } from '../src/store.js';

const OUT = new URL('./fixtures/', import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });

const write = (rel, body) => {
  const file = join(OUT, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(body, null, 1) + '\n');
};

const base = () => JSON.parse(JSON.stringify(defaultConfig()));

/* A started tournament: everybody banded, squads even. */
const BAND = { g1: 20, g2: 25, g3: 20, g4: 25, g5: 20, g6: 20, g7: 25, g8: 20, g9: 25, g10: 20, g11: 20 };
const SQUAD = { g1: 'UK', g2: 'USA', g3: 'USA', g4: 'UK', g5: 'USA', g6: 'USA',
                g7: 'UK', g8: 'USA', g9: 'UK', g10: 'UK', g11: 'UK' };

/* db — the factory tournament, roster mirrored into the config as the
   earliest builds wrote it. */
const factory = base();
factory.rev = 1;
write('db/config/tournament.json', factory);

/* db2 — the same tournament after somebody has taken four golfers off.
   no-clobber-test leans on this: an old build that still writes the mirror
   must not be able to put them back. */
const edited = base();
const DROPPED = ['g4', 'g5', 'g7', 'g8'];
edited.people = edited.people.filter(p => !DROPPED.includes(p.id));
edited.pairs = edited.pairs.map(p => ({ ...p, members: p.members.filter(m => !DROPPED.includes(m)) }));
edited.rev = 5;
write('db2/config/tournament.json', edited);

/* db4 — mid-migration, and the most interesting shape there is: the roster
   has been moved into its own documents, the flag says so, and the old copy
   is still sitting in the config for builds that have not caught up.
   Both tests that read this take it further themselves — no-clobber-test
   deletes the copy to get the stripped shape, ready-test deletes the flag to
   get the legacy one — so the fixture keeps everything and lets them. */
const migrating = base();
migrating.rosterInDocs = true;
migrating.rev = 20;
write('db4/config/tournament.json', migrating);

/* db7 — a tournament under way: bands set, squads picked, pairs in order.
   The roster is still mirrored, which is the shape that has caused the most
   trouble, so it is the one kept around to be tested against. */
const live = base();
live.people = live.people.map(p => ({ ...p,
  band: BAND[p.id] ?? p.band, location: SQUAD[p.id] ?? p.location }));
live.pairs = live.pairs.map((p, i) => ({ ...p, order: i, rev: 8 }));
live.rev = 41;
write('db7/config/tournament.json', live);

/* restore — the roster as documents, which is where it really lives.
   Taken from a tournament that has STARTED: bands set, squads picked. An
   unbanded roster puts the setup gate over the scoring screen, and a scrim
   over a screen is a test that cannot tap anything. */
for (const p of factory.people) write('restore/people/' + p.id + '.json',
  { ...p, band: BAND[p.id] ?? p.band, location: SQUAD[p.id] ?? p.location });
for (const p of factory.pairs) write('restore/pairs/' + p.id + '.json', { ...p, order: factory.pairs.indexOf(p) });

console.log('fixtures written to tools/fixtures/');
console.log('  people documents: ' + factory.people.length
  + '  (golfers ' + factory.people.filter(p => p.role === 'golfer').length + ')');
console.log('  pair documents:   ' + factory.pairs.length);
console.log('  db  rev ' + factory.rev + '  people in config: ' + factory.people.length);
console.log('  db2 rev ' + edited.rev + '  people in config: ' + edited.people.length + ' (four dropped)');
console.log('  db4 rev ' + migrating.rev + '  roster in documents AND still mirrored');
console.log('  db7 rev ' + live.rev + '  bands and squads set');
