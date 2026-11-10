import { client, requireConfigured } from './supabase-client.js';

const status = document.querySelector('#status');
const email = document.querySelector('#email');
const list = document.querySelector('#classes-list');
const createForm = document.querySelector('#create-class-form');
const joinForm = document.querySelector('#join-class-form');
const createButton = document.querySelector('#create-class-button');
const joinButton = document.querySelector('#join-class-button');
const refreshButton = document.querySelector('#refresh-classes');

let currentUser = null;

function showStatus(message, isError = false) {
  status.textContent = message;
  status.className = `text-sm mb-5 min-h-6 ${isError ? 'text-red-300' : 'text-green-300'}`;
}

function appendText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

async function loadClasses() {
  if (!currentUser) return;
  list.replaceChildren();
  appendText(list, 'li', 'Loading classes...', 'text-gray-400');

  const { data, error } = await client.from('classes')
    .select('id,name,created_by,join_code,created_at')
    .order('name', { ascending: true });

  list.replaceChildren();
  if (error) {
    showStatus(`Cannot load classes: ${error.message}`, true);
    return;
  }
  if (!data?.length) {
    appendText(list, 'li', 'No classes yet. Create one or join with a code.', 'text-gray-400');
    return;
  }
  for (const item of data) {
    const li = document.createElement('li');
    li.className = 'border border-gray-600 rounded-lg px-4 py-3 bg-gray-900/50';
    appendText(li, 'div', item.name, 'font-semibold');
    appendText(li, 'div', item.created_by === currentUser.id ? 'Owner' : 'Member', 'text-xs text-gray-400 mt-1');
    if (item.created_by === currentUser.id) {
      appendText(li, 'div', `Invitation code: ${item.join_code}`, 'text-sm font-mono text-indigo-300 mt-2 break-all');
    }
    list.appendChild(li);
  }
}

async function init() {
  if (!requireConfigured(status)) return;
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      window.location.replace('login.html');
      return;
    }
    currentUser = user;
    email.textContent = user.email ?? 'Authenticated';
    await loadClasses();
  } catch (error) {
    showStatus(`Initialization failed: ${error.message}`, true);
  }
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const name = document.querySelector('#class-name').value.trim();
  if (name.length < 2 || name.length > 80) {
    showStatus('Class name must contain 2–80 characters.', true);
    return;
  }
  createButton.disabled = true;
  showStatus('Creating class...');
  try {
    const { data, error } = await client.rpc('create_class', { p_name: name });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    showStatus(`Class created. Invitation code: ${created.class_join_code}`);
    createForm.reset();
    await loadClasses();
  } catch (error) {
    showStatus(`Cannot create class: ${error.message}`, true);
  } finally {
    createButton.disabled = false;
  }
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const code = document.querySelector('#join-code').value.trim().toUpperCase();
  if (!/^[A-F0-9]{16}$/.test(code)) {
    showStatus('Enter the 16-character hexadecimal invitation code.', true);
    return;
  }
  joinButton.disabled = true;
  showStatus('Joining class...');
  try {
    const { data, error } = await client.rpc('join_class', { p_code: code });
    if (error) throw error;
    const joined = Array.isArray(data) ? data[0] : data;
    showStatus(`Joined: ${joined.class_name}`);
    joinForm.reset();
    await loadClasses();
  } catch (error) {
    showStatus(`Cannot join class: ${error.message}`, true);
  } finally {
    joinButton.disabled = false;
  }
});

refreshButton.addEventListener('click', () => {
  loadClasses().catch(error => showStatus(error.message, true));
});

document.querySelector('#signout').addEventListener('click', async () => {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) {
    showStatus(`Sign out failed: ${error.message}`, true);
  } else {
    window.location.replace('index.html');
  }
});

await init();
