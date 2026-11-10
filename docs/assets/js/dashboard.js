import { client, requireConfigured } from './supabase-client.js';
const status = document.querySelector('#status');
const email = document.querySelector('#email');
if (requireConfigured(status)) {
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) window.location.replace('login.html');
    else email.textContent = user.email ?? 'Authenticated';
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('#signout').addEventListener('click', async () => {
  if (!client) return;
  await client.auth.signOut();
  window.location.replace('index.html');
});
