import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabaseUrl = "https://yqhovxlttsgagthglvfc.supabase.co";

const supabasePublishableKey =
  "sb_publishable_0dua6P1iO7Fcz6mmFYh3oQ_yCPJubUb";

export const isSupabaseConfigured =
  supabaseUrl !== "" && supabasePublishableKey !== "";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);