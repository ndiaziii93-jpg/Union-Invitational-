/* The only thing the book needs from the Supabase client, bundled into the
   one file the app already is. Bundled by tools/vendor.py — do not edit the
   generated output beside this. */
import { createClient } from '@supabase/supabase-js';
window.__supabase = { createClient };
