import {client,requireConfigured} from './supabase-client.js';
import {$,lang,el,toast,status,showUser,storeClass,updateNavClass,ft,translateFeature,installTranslations,setSelectClasses,getSignedIn,defaultDeadline,invoke,aiState,renderBullets} from './features-common.js';
const BUCKET='class-materials';
const supported=new Set(['pdf','docx','pptx','xlsx','txt','png','jpg','jpeg','webp']);
const mimes={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
const MAX_SINGLE=10485760,MAX_TOTAL=20971520,MAX_FILES=4;
let user=null,classes=[],classId=null,subjects=[],materials=[],currentMaterial=null,currentAnalysis=null;
function extension(filename){return String(filename).toLowerCase().split('.').pop()||''}
function busy(button,flag){button.disabled=flag;button.setAttribute('aria-busy',String(flag));}
function messages(err){status(err.message,true);toast(err.message,true)}
function trimName(name){return String(name).slice(0,180)}
function cardActions(material,host,cached){const controls=el('div','feature-actions');
 const ai=el('button','button primary compact',cached?ft('cached'):ft('analyze'));
 ai.type='button';
 if(!cached&&material.uploaded_by!==user.id){ai.textContent=ft('onlyUploader');ai.disabled=true}
 ai.addEventListener('click',async()=>{
   busy(ai,true);try{
     if(cached){currentMaterial=material;currentAnalysis=cached;renderAnalysis();$('#analysis-panel').scrollIntoView({behavior:'smooth',block:'start'});return}
     const result=aiState(await invoke(client,'ai-generate',{kind:'material',material_id:material.id,language:lang()}));
     currentMaterial=material;currentAnalysis=result;renderAnalysis();toast(ft('analysisDone'));await loadMaterials();$('#analysis-panel').scrollIntoView({behavior:'smooth',block:'start'});
   }catch(e){messages(e)}finally{busy(ai,false)}
 });controls.append(ai);
 if(material.uploaded_by===user.id){const del=el('button','button danger compact',ft('delete'));del.type='button';
  del.addEventListener('click',async()=>{if(!confirm(ft('confirmDelete')))return;busy(del,true);try{await invoke(client,'material-delete',{material_id:material.id});toast(ft('removed'));if(currentMaterial?.id===material.id){currentMaterial=null;currentAnalysis=null;$('#analysis-panel').hidden=true}await loadMaterials()}catch(e){messages(e)}finally{busy(del,false)}});
  controls.append(del)
 }
 host.append(controls);
}
async function downloadFile(file){
 try{
 const {data,error}=await client.storage.from(BUCKET).download(file.storage_path);if(error||!data)throw error||Error('File download failed');
 const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=file.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){messages(e)}
}
async function loadMaterials(){
 const {data,error}=await client.from('materials').select('id,class_id,subject_id,title,description,uploaded_by,created_at,material_files(id,filename,storage_path,byte_size)')
   .eq('class_id',classId).order('created_at',{ascending:false});if(error)throw error;
 materials=data||[];const host=$('#materials-list');host.replaceChildren();
 if(!materials.length){host.append(el('p','subtle',ft('noMaterials')));return;}
 const {data:cachedRows,error:ce}=await client.from('ai_results').select('material_id,result,finished_at')
   .eq('class_id',classId).eq('kind','material').eq('status','done').order('finished_at',{ascending:false}).limit(150);
 if(ce)throw ce;
 const cached=new Map();for(const row of cachedRows||[]){if(row.result?.language===lang()&&!cached.has(row.material_id))cached.set(row.material_id,row.result)}
 for(const m of materials){
   const card=el('article','card material-card');const header=el('div');header.append(el('h3','',m.title));header.append(el('p','material-meta',`${new Date(m.created_at).toLocaleDateString()} · ${m.uploaded_by===user.id?ft('owner'):ft('member')}`));card.append(header);
   cardActions(m,card,cached.get(m.id));
   if(m.description)card.append(el('p','material-description',m.description));
   const files=el('div','material-files');for(const f of m.material_files||[]){const b=el('button','file-chip',`${f.filename} (${Math.round(f.byte_size/1024)} KB)`);b.type='button';b.addEventListener('click',()=>downloadFile(f));files.append(b)}card.append(files);host.append(card);
 }
}
async function loadSubjects(){const {data,error}=await client.from('subjects').select('id,name').eq('class_id',classId).order('name');if(error)throw error;subjects=data||[];
 const select=$('#material-subject');select.replaceChildren();for(const s of subjects){const o=el('option','',s.name);o.value=s.id;select.append(o)}
 if(!subjects.length){const o=el('option','',ft('noSubject'));o.value='';select.append(o);select.disabled=true;$('#upload-button').disabled=true;status(ft('noSubject'))}else{select.disabled=false;$('#upload-button').disabled=false;status('')}
}
async function activateClass(id){classId=id;storeClass(user.id,id);updateNavClass(id);$('#class-link').href=`class.html?id=${encodeURIComponent(id)}`;$('#analysis-panel').hidden=true;currentMaterial=null;currentAnalysis=null;await loadSubjects();await loadMaterials();}
function section(root,title,content,isList=false){const block=el('section','analysis-section');block.append(el('h3','',title));if(isList)renderBullets(block,content);else block.append(el('p','',content||'—'));root.append(block)}
function renderAnalysis(){if(!currentAnalysis||!currentMaterial)return;
 const a=currentAnalysis,root=$('#analysis-content');root.replaceChildren();$('#analysis-meta').textContent=currentMaterial.title;
 section(root,ft('overview'),a.overview);section(root,ft('mainIdeas'),a.main_ideas,true);
 const terms=(a.key_terms||[]).map(x=>`${x.term}: ${x.definition}`);section(root,ft('keyTerms'),terms,true);
 section(root,ft('details'),a.important_details,true);section(root,ft('understanding'),a.student_understanding);
 const container=$('#suggested-tasks');container.replaceChildren();(a.learning_tasks||[]).forEach((task,i)=>{
   const label=el('label','suggested-task');const cb=document.createElement('input');cb.type='checkbox';cb.dataset.taskIndex=String(i);
   const detail=el('div');detail.append(el('strong','',task.title),el('p','',task.description),el('small','',`${task.estimated_minutes} min`));
   label.append(cb,detail);container.append(label)
 });$('#analysis-panel').hidden=false;
}
async function addSelected(){if(!currentMaterial||!currentAnalysis)return;
 const chosen=[...$('#suggested-tasks').querySelectorAll('input:checked')].map(n=>currentAnalysis.learning_tasks[Number(n.dataset.taskIndex)]);
 if(!chosen.length){toast(ft('noSelection'),true);return}
 const due_date=$('#ai-task-date').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(due_date)){toast('Choose a deadline',true);return}
 const btn=$('#add-selected');busy(btn,true);
 try{
   const rows=chosen.map(x=>({class_id:currentMaterial.class_id,user_id:user.id,subject_id:currentMaterial.subject_id,
    title:trimName(x.title)||'Study task',description:String(x.description||'').slice(0,3000),
    notes:`[AI material] ${currentMaterial.title}: ${x.estimated_minutes} minutes`.slice(0,3000),due_date}));
   const {error}=await client.from('tasks').insert(rows);if(error)throw error;
   toast(ft('selectedAdded'));status(ft('selectedAdded'));
   $('#suggested-tasks').querySelectorAll('input').forEach(x=>x.checked=false);
 }catch(e){messages(e)}finally{busy(btn,false)}
}
async function upload(e){e.preventDefault();if(!classId||!subjects.length)return;
 const title=$('#material-title').value.trim(),description=$('#material-description').value.trim(),subjectId=$('#material-subject').value;
 const files=[...$('#material-files').files];
 if(!title||!subjects.some(s=>s.id===subjectId)){toast('Select a title and subject',true);return}
 if(files.length<1||files.length>MAX_FILES||files.some(f=>f.size<1||f.size>MAX_SINGLE||f.name.length>180||!supported.has(extension(f.name)))||files.reduce((a,f)=>a+f.size,0)>MAX_TOTAL){toast(ft('sizeHint'),true);return}
 const button=$('#upload-button');busy(button,true);let materialId=null;const uploaded=[];
 try{
  const {data:material,error:me}=await client.from('materials').insert({class_id:classId,subject_id:subjectId,title,description,uploaded_by:user.id}).select('id').single();if(me)throw me;materialId=material.id;
  for(const file of files){const ext=extension(file.name);const path=`${classId}/${user.id}/${crypto.randomUUID()}.${ext}`;
   const {error:se}=await client.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:mimes[ext]});if(se)throw se;uploaded.push(path);
   const {error:fe}=await client.from('material_files').insert({material_id:materialId,uploaded_by:user.id,storage_path:path,filename:file.name.slice(0,180),mime_type:mimes[ext],byte_size:file.size});if(fe)throw fe;
  }
  $('#upload-form').reset();toast(ft('created'));await loadMaterials();status(ft('created'));
 }catch(e){
   // Best-effort rollback for interrupted multi-file uploads. Can be retried via the owner's delete button.
   if(uploaded.length)await client.storage.from(BUCKET).remove(uploaded);
   if(materialId)await client.from('materials').delete().eq('id',materialId).eq('uploaded_by',user.id);
   messages(e);
 }finally{busy(button,false)}
}
$('#upload-form').addEventListener('submit',upload);
$('#add-selected').addEventListener('click',addSelected);
$('#analysis-close').addEventListener('click',()=>$('#analysis-panel').hidden=true);
$('#refresh').addEventListener('click',async()=>{try{await loadMaterials()}catch(e){messages(e)}});
$('#class-select').addEventListener('change',async(e)=>{try{await activateClass(e.target.value)}catch(err){messages(err)}});
async function init(){if(!requireConfigured($('#status')))return;$('#ai-task-date').value=defaultDeadline();installTranslations(client,()=>{currentAnalysis=null;currentMaterial=null;$('#analysis-panel').hidden=true;if(materials.length)loadMaterials().catch(messages)});
 try{user=await getSignedIn(client);const {data,error}=await client.from('classes').select('id,name').order('name');if(error)throw error;classes=data||[];classId=setSelectClasses($('#class-select'),classes,user.id,new URLSearchParams(location.search).get('class'));
 if(!classId){status('Join a class first.');$('#upload-button').disabled=true;return}await activateClass(classId)}catch(e){messages(e)}}
await init();
