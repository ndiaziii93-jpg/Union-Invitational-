/* Where the book keeps its tournament.

   The Supabase URL and the publishable key are not secrets: a publishable
   key is designed to sit in a page anyone can read, and what it is allowed
   to do is decided by the rules on the database, not by hiding it. The
   Anthropic key is a secret, and is not here — it lives in a Supabase
   secret that only the recap function can read.

   An empty URL is a valid state: the book falls back to this-device-only
   storage and says so in the status bar, exactly as it does today when the
   artifact store is unavailable. */

export const SUPABASE_URL = 'https://zolsghkbgceularukood.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_g8feql6XYrOP60S6bFNz9A_rTKMPrZw';

/* Photos are resized before they leave the phone. The strip shows the small
   one; the big one is only fetched when somebody taps it. Resort wifi is
   resort wifi, and the free storage allowance is one gigabyte. */
export const PHOTO_BUCKET = 'photos';
export const PHOTO_MAX = 1600;
export const THUMB_MAX = 420;
