import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://gerfcruckjwhcugucopy.supabase.co";
const supabasePublishableKey = "sb_publishable_ULxOd_fwirUwSFz_BxOGww_NsjmIzBL";

export const isSupabaseConfigured =
  supabasePublishableKey !== "ISI_PUBLISHABLE_KEY_DI_SINI";
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
