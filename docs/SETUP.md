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

After this, scores, the roster, the pairs, rounds, bingo points and recaps
can only be written through the server's own functions, which check the PIN
first; the public key cannot touch those rows directly. Wrong guesses are
limited to twelve a minute for everyone. Changing a PIN later is done from
Setup with the master PIN, as before — the server does the changing.

What this does not cover, because the book has no accounts: the chat, the
bets and the photos are as trustworthy as a group chat — anyone with the
link can post as anyone, exactly as before — and the commissioner settles the
beers.

## What I need back from you

| | Where from | Send me |
|---|---|---|
| Supabase Project URL | Project Settings → API | `https://….supabase.co` |
| Supabase anon key | Project Settings → API | `eyJ…` |
| Anthropic API key | console.anthropic.com → API keys | `sk-ant-…` (privately) |

Nothing else. Not the database password, not the service_role key.
