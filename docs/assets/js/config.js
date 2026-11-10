// Public configuration ONLY. Replace placeholders after creating Supabase project.
// Publishable key is intended for browser usage; access control still requires RLS.
// NEVER put OpenAI API keys, sb_secret_ keys, database passwords, or service-role keys here.
export const SUPABASE_URL = 'https://xfysficyyxptvnjfruux.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6-MoRCC_w38T1Dg74QaRrw_gfy6Wv0b';

export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  SUPABASE_PUBLISHABLE_KEY !== 'YOUR_PUBLISHABLE_KEY';
