import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isConfigured } from './config.js';

export const client = isConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

export function requireConfigured(statusElement) {
  if (client) return true;
  statusElement.textContent = 'Сначала укажи Supabase URL и Publishable Key в assets/js/config.js.';
  statusElement.style.color = '#fca5a5';
  return false;
}
