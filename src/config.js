/* Where the book keeps its tournament.

   The Supabase URL and the publishable key are not secrets: a publishable
   key is designed to sit in a page anyone can read, and what it is allowed
   to do is decided by the rules on the database, not by hiding it. The
   Anthropic key is a secret, and is not here — it lives in a Supabase
   secret that only the recap function can read.

   An empty URL is a valid state: the book falls back to this-device-only
   storage and says so in the status bar, exactly as it does today when the
   artifact store is unavailable. */

/* Filled in by tools/build.py. The installable app gets the real project;
   the artifact copy and the public test copy get empty strings and keep the
   store they already have — the team's test scribbles must never land in the
   tournament everyone is actually playing. */
export const SUPABASE_URL = '__SUPABASE_URL__';
export const SUPABASE_KEY = '__SUPABASE_KEY__';

/* Photos are resized before they leave the phone. The strip shows the small
   one; the big one is only fetched when somebody taps it. Resort wifi is
   resort wifi, and the free storage allowance is one gigabyte. */
export const PHOTO_BUCKET = 'photos';
export const PHOTO_MAX = 1600;
export const THUMB_MAX = 420;
