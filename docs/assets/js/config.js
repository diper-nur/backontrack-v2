// Public configuration ONLY. Replace placeholders after creating Supabase project.
// Publishable key is intended for browser usage; access control still requires RLS.
// NEVER put OpenAI API keys, sb_secret_ keys, database passwords, or service-role keys here.
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'YOUR_PUBLISHABLE_KEY';

export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  SUPABASE_PUBLISHABLE_KEY !== 'YOUR_PUBLISHABLE_KEY';
