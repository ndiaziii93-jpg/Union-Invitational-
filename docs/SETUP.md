# Setting up the two accounts

Everything here is free and needs no credit card. Do these in any order —
I can build most of the app before either exists.

---

## 1. Supabase — the shared database, the photos, and the recap writer

**Cost: £0. No card.** Free tier gives 500 MB database, 1 GB photo storage,
200 live connections and 2 million realtime messages a month. We will use a
fraction of each.

1. Go to **https://supabase.com** and click **Start your project**.
2. Sign in with **GitHub** (you already have the account — fewer passwords).
3. Click **New project**.
   - **Name:** `union-invitational`
   - **Database password:** let it generate one, then **copy it somewhere safe**.
     You will almost never need it, but it cannot be shown again.
   - **Region:** choose **West EU (London)** or **Central EU (Frankfurt)** —
     closest to Türkiye of the European options, so the course is nearer the
     database than it would be to a US region.
   - **Plan:** Free.
4. Wait about two minutes for it to finish building.
5. Open **Project Settings → API** and copy these two values to me:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public key** — a long string starting `eyJ...`

### Are those safe to share?

Yes. The anon key is *designed* to sit inside a public web page — it is how
every browser talks to the project. It grants nothing on its own; what it can
read and write is decided by rules I will write on the database itself. Do not
send me the **service_role** key or the database password: those are the real
keys and they never leave your account.

### One thing to remember

A free Supabase project **pauses after 7 days with no activity**. It wakes with
one click in the dashboard. Open the app once a week between now and the trip
and it will never happen. During the week in Türkiye it will be in use daily.

Even if it did pause mid-round, the app keeps scoring on the phone and syncs
when the project is back — nobody on the course would be stuck.

---

## 2. An Anthropic API key — for the Day's Recap

**Cost: roughly £1–2 for the whole tournament.** This is the only thing on the
whole plan that costs money.

1. Go to **https://console.anthropic.com**.
2. Sign in. This is a **separate account from your Claude subscription** — a
   Claude Pro or Max plan does not include API credit, and API credit does not
   affect your Claude usage. They are billed apart.
3. Go to **Billing** and add credit. **$5 is more than enough** — the whole
   week's recaps come to about $1.50 even with regenerating a few.
   (There is no subscription. You are buying credit, and unused credit stays.)
4. Go to **API keys → Create key**.
   - **Name:** `union-invitational-recap`
5. Copy the key — it starts `sk-ant-` — and **send it to me privately**.

### Where the key ends up

Not in the app. It goes into a Supabase secret that only a small server-side
function can read. Nobody who installs the book — and nobody who views the
page source — can see it or spend it.

### What a recap actually costs

About 5,000 tokens of scorecard go in, and a headline, three paragraphs and
the honours come back. On Claude Opus 5 that is roughly **5–10p per recap**.
Four rounds, plus regenerating when you do not like the first draft, comes to
**£1–2 for the week**.

If you would rather it were a fifth of that, say so and I will point it at a
smaller model — but this is the part everyone will read out loud at dinner,
and I would spend the pound.

---

## 3. GitHub Pages — where the app lives

Nothing to sign up for; the repository is already yours and already public.
When the build is ready I will tell you the one toggle to flip in
**Settings → Pages**, and the app will be live at

    https://ndiaziii93-jpg.github.io/Union-Invitational-/

That is the link that goes in the WhatsApp group. On an iPhone: open it in
Safari, tap **Share → Add to Home Screen**. On Android: tap **Install** when
the browser offers. It then opens fullscreen with its own icon, like any other
golf app, and works with no signal.

---

## 4. Lock the book down — PINs checked by the server, never by a phone

The app runs in the browser and the repository is public, so anyone can read
its code and anyone can change the copy running on their own phone. What
stops a changed copy from doing anything is the database refusing it. Run
`docs/supabase-lockdown.sql` once and it does:

1. Open **Supabase → SQL Editor → New query** and paste the whole of
   `docs/supabase-lockdown.sql`.
2. Near the bottom, replace the three placeholders with the PINs you choose
   (`TYPE-THE-MASTER-PIN-HERE` and the two scorers'). Six digits or more for
   the master PIN. Type them there and nowhere else — never into a chat,
   never into the repository.
3. **Run**. The check at the end should list three rows and say the config
   has no PINs in it any more.
4. The SQL editor keeps a history of queries: open the ⋯ menu on this one
   and delete it, so the PINs are not sitting in it.
5. Tell the two scorers their PINs in person. Every phone signs in again
   (Manage → Setup, or the PIN prompt on the first score): the PINs that
   were in the book before are gone.

After this, scores, the roster (handicaps included — only the master PIN
moves one), the pairs, rounds, bingo points and recaps can only be written
through the server's own functions, which check the PIN first; the public
key cannot touch those rows directly. Wrong guesses count against the phone
that made them (a right PIN always passes), and a name with ten wrong
guesses against it is closed for ten minutes. Changing a PIN later is done from Setup with the master
PIN, as before — the server does the changing.

The chat, the bets and the golfers' notes are signed. A name is claimed with
a four-digit PIN that the server keeps hashed and never shows; every post,
bet, reaction and note goes through the server with that name and PIN, and a
name can only write what is its own. Nobody can post, bet or react as anyone
else, and nobody can edit or remove another phone's post. The name PINs that
were in the book before are hashed where they stand — but anyone who read
the database before today may know them, so the safest course is the
commented line near the end of the SQL (`delete from public.docs where path
like 'chat/id\_%'`), which makes everyone choose a fresh PIN the next time
they open the chat. Forgotten a name PIN? The master PIN clears it from the
Roster (Clear PIN), and the person chooses again.

Still open, and worth knowing: photos can be added by anyone with the link
(and removed by anyone, as before); the bleachers sign with the phone they
registered on rather than a PIN; and the recap writer's spend is capped by
the limit you set in the Anthropic console, not by the book.

## 5. The watch — alerts when someone tries it on

The server logs every refusal: a PIN it did not know, a write it would not
sign, a write with the public key straight at the table (dropped silently,
so the attacker learns nothing), and every phone it blocked (ten refusals
in ten minutes blocks a phone for 24 hours). Only the master PIN reads the
log. It comes with the lockdown SQL in section 4 — nothing more to run.

**On your phone.** Signed in with the master PIN, the book looks at the
log every minute and puts a red bar at the top of every screen when there
is something new; Manage → Setup → Security shows the whole log, the
blocked phones (with Unblock), and **Copy report** — paste that to me and I
will read it, mitigate and patch.

**As a push notification (optional, five minutes).** The database can send
each new entry to your phone as it happens:

1. Make up a long random string (a password manager will) — the webhook
   secret. It never leaves your Supabase project.
2. Supabase → Edge Functions → **notify** → Secrets → add
   `SECURITY_WEBHOOK_SECRET` = that string. Redeploy `notify` from
   `supabase/functions/notify/index.ts` (it carries the alert handler now).
3. Supabase → Database → **Webhooks** → Create: table `security_log`, event
   **Insert**, type HTTP request, method POST, URL
   `https://<your project>.supabase.co/functions/v1/notify`, headers
   `apikey: <the publishable key>` and `x-security-secret: <the string>`.
4. On your phone, turn notifications on in the chat (the bell) while signed
   in with the master PIN. Alerts go only to phones that hold it.

## What I need back from you

| | Where from | Send me |
|---|---|---|
| Supabase Project URL | Project Settings → API | `https://….supabase.co` |
| Supabase anon key | Project Settings → API | `eyJ…` |
| Anthropic API key | console.anthropic.com → API keys | `sk-ant-…` (privately) |

Nothing else. Not the database password, not the service_role key.
