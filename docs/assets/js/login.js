import { client, requireConfigured } from './supabase-client.js';
const form = document.querySelector('#login-form');
const status = document.querySelector('#status');
const button = document.querySelector('#submit-button');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireConfigured(status)) return;
  button.disabled = true;
  status.textContent = 'Signing in...';
  try {
    const { error } = await client.auth.signInWithPassword({
      email: form.email?.value ?? document.querySelector('#email').value.trim(),
      password: document.querySelector('#password').value,
    });
    if (error) throw error;
    window.location.assign('dashboard.html');
  } catch (error) {
    status.textContent = error.message;
    status.style.color = '#fca5a5';
  } finally { button.disabled = false; }
});
