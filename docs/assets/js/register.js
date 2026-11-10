import { client, requireConfigured } from './supabase-client.js';
const form = document.querySelector('#register-form');
const status = document.querySelector('#status');
const button = document.querySelector('#submit-button');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireConfigured(status)) return;
  const password = document.querySelector('#password').value;
  if (password !== document.querySelector('#confirm').value) {
    status.textContent = 'Passwords do not match.'; status.style.color = '#fca5a5'; return;
  }
  button.disabled = true; status.textContent = 'Creating account...';
  try {
    const { data, error } = await client.auth.signUp({
      email: document.querySelector('#email').value.trim(),
      password,
      options: { emailRedirectTo: new URL('login.html', window.location.href).href },
    });
    if (error) throw error;
    if (data.session) window.location.assign('dashboard.html');
    else { status.style.color = '#86efac'; status.textContent = 'Check your email for a confirmation link. Then log in.'; }
  } catch (error) {
    status.textContent = error.message; status.style.color = '#fca5a5';
  } finally { button.disabled = false; }
});
