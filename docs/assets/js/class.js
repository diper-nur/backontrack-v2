import { client, requireConfigured } from './supabase-client.js';

const $ = (selector) => document.querySelector(selector);
const statusEl = $('#status');
const classId = new URLSearchParams(window.location.search).get('id');
let currentUser = null;
let subjects = [];
let tasks = [];
let classInfo = null;

function status(message, error = false) {
  statusEl.textContent = message;
  statusEl.className = `text-sm min-h-6 mb-5 ${error ? 'text-red-300' : 'text-green-300'}`;
}

function addText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

function localISODate(date) {
  const p = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function setTomorrow() {
  const now = new Date();
  $('#task-date').value = localISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

function isMemberClassId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function setInputEnabled(enabled) {
  $('#add-task').disabled = !enabled;
  $('#add-subject').disabled = !enabled;
}

async function loadSubjects() {
  const { data, error } = await client.from('subjects')
    .select('id,name,created_at')
    .eq('class_id', classId)
    .order('name', { ascending: true });
  if (error) throw new Error(`Subjects: ${error.message}`);
  subjects = data || [];

  const list = $('#subjects-list');
  list.replaceChildren();
  if (!subjects.length) addText(list, 'li', 'No subjects yet.', 'text-gray-400');
  for (const subject of subjects) addText(list, 'li', subject.name, 'border border-gray-600 bg-gray-900/50 rounded-lg px-3 py-2');

  const select = $('#task-subject');
  const previous = select.value;
  select.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'General / no subject';
  select.appendChild(defaultOption);
  for (const subject of subjects) {
    const option = document.createElement('option');
    option.value = subject.id;
    option.textContent = subject.name;
    select.appendChild(option);
  }
  if (subjects.some(s => s.id === previous)) select.value = previous;
}

function dueCategory(task) {
  if (task.status === 'completed') return 4;
  const today = localISODate(new Date());
  if (task.due_date < today) return 0;
  if (task.due_date === today) return 1;
  const now = new Date();
  const inSeven = localISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  return task.due_date <= inSeven ? 2 : 3;
}

function updateProgress() {
  const finished = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  const pending = total - finished;
  const pct = total ? Math.round(100 * finished / total) : 0;
  $('#progress-counts').textContent = `${total} total · ${finished} completed · ${pending} pending`;
  $('#progress-percent').textContent = `${pct}%`;
  $('#progress-bar').style.width = `${pct}%`;
  $('#progress-wrapper').setAttribute('aria-valuenow', String(pct));

  const now = new Date();
  const tomorrow2 = localISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
  const today = localISODate(now);
  const approaching = tasks.filter(t => t.status === 'pending' && t.due_date >= today && t.due_date <= tomorrow2);
  $('#upcoming').textContent = approaching.length ? `${approaching.length} task(s) due within 2 days.` : '';
}

function renderTasks() {
  updateProgress();
  const list = $('#tasks-list');
  list.replaceChildren();
  const filter = $('#task-filter').value;
  const visible = tasks.filter(t => filter === 'all' || t.status === filter).sort((a, b) => {
    const priority = dueCategory(a) - dueCategory(b);
    return priority || a.due_date.localeCompare(b.due_date) || b.created_at.localeCompare(a.created_at);
  });
  if (!visible.length) {
    addText(list, 'li', 'No tasks in this view.', 'text-gray-400');
    return;
  }
  const subjectNames = new Map(subjects.map(s => [s.id, s.name]));
  for (const task of visible) {
    const li = document.createElement('li');
    li.className = 'border border-gray-600 bg-gray-900/50 rounded-lg px-4 py-4';
    const top = document.createElement('div');
    top.className = 'flex flex-wrap justify-between gap-3 items-start';
    const content = document.createElement('div');
    content.className = 'flex-1 min-w-0';
    addText(content, 'h3', task.title, `font-semibold break-words ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-white'}`);
    const category = dueCategory(task);
    const badge = task.status === 'completed' ? 'Completed' : category === 0 ? 'Overdue' : category === 1 ? 'Due today' : 'Pending';
    addText(content, 'p', `${subjectNames.get(task.subject_id) || 'General'} · Due ${task.due_date} · ${badge}`, `text-xs mt-2 ${category === 0 ? 'text-red-300' : 'text-gray-400'}`);
    if (task.description) addText(content, 'p', task.description, 'text-sm text-gray-300 mt-2 whitespace-pre-wrap break-words');
    if (task.notes) addText(content, 'p', `Notes: ${task.notes}`, 'text-sm text-gray-400 mt-2 whitespace-pre-wrap break-words');
    top.appendChild(content);
    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';
    const toggle = addText(actions, 'button', task.status === 'completed' ? 'Reopen' : 'Mark done', 'text-sm rounded-lg border border-indigo-500 px-3 py-2 hover:bg-indigo-900/50');
    toggle.type = 'button';
    toggle.addEventListener('click', () => changeTaskStatus(task, toggle));
    const remove = addText(actions, 'button', 'Delete', 'text-sm rounded-lg border border-red-600/50 text-red-300 px-3 py-2 hover:bg-red-950/40');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteTask(task, remove));
    top.appendChild(actions);
    li.appendChild(top);
    list.appendChild(li);
  }
}

async function loadTasks() {
  const { data, error } = await client.from('tasks')
    .select('id,title,description,notes,subject_id,due_date,status,created_at')
    .eq('class_id', classId)
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Tasks: ${error.message}`);
  tasks = data || [];
  renderTasks();
}

async function refreshAll() {
  await loadSubjects();
  await loadTasks();
}

async function changeTaskStatus(task, button) {
  button.disabled = true;
  const complete = task.status !== 'completed';
  try {
    const { data, error } = await client.from('tasks')
      .update({ status: complete ? 'completed' : 'pending', completed_at: complete ? new Date().toISOString() : null })
      .eq('id', task.id)
      .eq('user_id', currentUser.id)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Update was not permitted.');
    await loadTasks();
    status(complete ? 'Task completed.' : 'Task reopened.');
  } catch (error) {
    status(`Cannot update task: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function deleteTask(task, button) {
  if (!window.confirm(`Delete task "${task.title}"?`)) return;
  button.disabled = true;
  try {
    const { data, error } = await client.from('tasks')
      .delete()
      .eq('id', task.id)
      .eq('user_id', currentUser.id)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Deletion was not permitted.');
    await loadTasks();
    status('Task deleted.');
  } catch (error) {
    status(`Cannot delete task: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

$('#subject-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !classInfo) return;
  const name = $('#subject-name').value.trim();
  if (name.length < 2 || name.length > 80) return status('Subject name must contain 2–80 characters.', true);
  $('#add-subject').disabled = true;
  try {
    const { error } = await client.from('subjects')
      .insert({ class_id: classId, created_by: currentUser.id, name });
    if (error) throw error;
    $('#subject-form').reset();
    await loadSubjects();
    status('Subject added to the class.');
  } catch (error) {
    status(error.code === '23505' ? 'This subject already exists in this class.' : `Cannot add subject: ${error.message}`, true);
  } finally {
    $('#add-subject').disabled = false;
  }
});

$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !classInfo) return;
  const title = $('#task-title').value.trim();
  const description = $('#task-description').value.trim();
  const notes = $('#task-notes').value.trim();
  const dueDate = $('#task-date').value;
  const subjectId = $('#task-subject').value || null;
  if (!title || title.length > 180 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return status('Enter a title and a valid deadline.', true);
  }
  $('#add-task').disabled = true;
  try {
    const { error } = await client.from('tasks').insert({
      user_id: currentUser.id,
      class_id: classId,
      subject_id: subjectId,
      title,
      description,
      notes,
      due_date: dueDate
    });
    if (error) throw error;
    $('#task-form').reset();
    setTomorrow();
    await loadTasks();
    status('Task added.');
  } catch (error) {
    status(`Cannot add task: ${error.message}`, true);
  } finally {
    $('#add-task').disabled = false;
  }
});

$('#task-filter').addEventListener('change', renderTasks);
$('#refresh').addEventListener('click', async () => {
  try { await refreshAll(); status('Updated.'); }
  catch (error) { status(error.message, true); }
});
$('#signout').addEventListener('click', async () => {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) status(`Sign out failed: ${error.message}`, true);
  else window.location.replace('index.html');
});

async function init() {
  setTomorrow();
  if (!requireConfigured(statusEl)) return;
  if (!isMemberClassId(classId)) return status('Invalid class link. Return to All classes.', true);
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return window.location.replace('login.html');
    currentUser = user;
    $('#email').textContent = user.email || 'Authenticated';
    const { data, error } = await client.from('classes')
      .select('id,name,created_by')
      .eq('id', classId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return status('This class was not found or you are not a member.', true);
    classInfo = data;
    $('#class-title').textContent = data.name;
    $('#membership-role').textContent = data.created_by === user.id ? 'Owner' : 'Member';
    await refreshAll();
    setInputEnabled(true);
    status('Class loaded.');
  } catch (error) {
    status(`Could not load class: ${error.message}`, true);
  }
}

await init();
