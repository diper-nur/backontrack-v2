import {client,requireConfigured} from './supabase-client.js';
import {$,t,setupCommon,showUser,updateNavClass,status,toast,chosenClass,storeClass,sortTasks,progress,updateChart,el,createTaskRow,renderDeadlineAlert} from './ui-v4.js';

let user=null;let classes=[];let classId=null;let tasks=[];

function updateDeadlineButton(){const b=$('#show-deadlines');b.disabled=!classId;}
function renderShortcuts(){const host=$('#class-shortcuts');host.replaceChildren();if(!classes.length){host.append(el('p','subtle',t('noClass')));return;}for(const cls of classes){const a=el('a','class-chip',cls.name);a.href=`class.html?id=${encodeURIComponent(cls.id)}`;a.setAttribute('aria-current',String(cls.id===classId));host.append(a);}}
function renderSummary(){const p=progress(tasks);$('#stat-total').textContent=p.total;$('#stat-completed').textContent=p.completed;$('#stat-pending').textContent=p.pending;$('#stat-progress').textContent=`${p.percent}%`;$('#chart-percent').textContent=`${p.percent}%`;updateChart($('#chart'),tasks);
  const tbody=$('#tasks-tbody');tbody.replaceChildren();const sorted=sortTasks(tasks);if(!sorted.length){const tr=el('tr');const td=el('td','empty',t('noTasks'));td.colSpan=5;tr.append(td);tbody.append(tr);}else for(const task of sorted)tbody.append(createTaskRow(task));
  if(user&&classId)renderDeadlineAlert(tasks,user.id,classId);else $('#deadline-alert').hidden=true;
}
async function loadTasks(){tasks=[];if(!classId){renderSummary();return;}status('');const {data,error}=await client.from('tasks').select('id,title,description,notes,due_date,status,created_at').eq('class_id',classId).eq('user_id',user.id).order('created_at',{ascending:false});if(error){renderSummary();throw new Error(`Tasks: ${error.message}`);}tasks=data||[];renderSummary();}
async function activateClass(id){if(!classes.some(c=>c.id===id)){classId=null;tasks=[];$('#class-title').textContent='—';updateNavClass(null);$('#open-tasks').href='join.html';renderShortcuts();renderSummary();status(t('noClass'));updateDeadlineButton();return;}
  classId=id;storeClass(user.id,id);$('#class-select').value=id;$('#class-title').textContent=classes.find(c=>c.id===id).name;updateNavClass(id);$('#open-tasks').href=`class.html?id=${encodeURIComponent(id)}`;renderShortcuts();updateDeadlineButton();await loadTasks();}
async function refreshClasses(){const {data,error}=await client.from('classes').select('id,name,created_by,join_code').order('name');if(error)throw error;classes=data||[];
  const select=$('#class-select');select.replaceChildren();for(const c of classes){const o=el('option','',c.name);o.value=c.id;select.append(o)}if(!classes.length){const o=el('option','',t('noClass'));o.value='';select.append(o);select.disabled=true;}else select.disabled=false;
  const requested=new URLSearchParams(location.search).get('class');const chosen=chosenClass(user.id,classes,requested);await activateClass(chosen);
}
$('#class-select').addEventListener('change',async e=>{try{await activateClass(e.target.value);const url=new URL(location.href);url.searchParams.set('class',e.target.value);history.replaceState(null,'',url);}catch(err){status(err.message,true)}});
$('#show-deadlines').addEventListener('click',()=>{if(user&&classId){renderDeadlineAlert(tasks,user.id,classId,{force:true});if($('#deadline-alert').hidden)toast(t('none'))}});
async function init(){if(!requireConfigured($('#status')))return;setupCommon(client,()=>{renderShortcuts();renderSummary()});try{const {data:{user:authUser},error}=await client.auth.getUser();if(error||!authUser){location.replace('login.html');return;}user=authUser;showUser(user.email);await refreshClasses();}catch(e){status(`Could not load dashboard: ${e.message}`,true)}}
await init();
