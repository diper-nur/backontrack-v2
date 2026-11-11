import {client,requireConfigured} from './supabase-client.js';
import {$,el,lang,toast,status,storeClass,updateNavClass,ft,translateFeature,installTranslations,setSelectClasses,getSignedIn,invoke,aiState} from './features-common.js';
let user=null,classId=null,classes=[],latest=null;
function error(e){status(e.message,true);toast(e.message,true)}
function busy(btn,state){btn.disabled=state;btn.setAttribute('aria-busy',String(state))}
async function loadQuota(){const day=new Date().toISOString().slice(0,10);const {data,error}=await client.from('ai_usage_daily').select('used').eq('user_id',user.id).eq('usage_day',day).maybeSingle();if(error)throw error;$('#quota-info').textContent=`${data?.used||0} / 5`}
function renderPlan(){const host=$('#plan-list');host.replaceChildren();
 if(!latest){host.append(el('div','card',ft('noPlan')));$('#plan-time').textContent='';return}
 const grouped={};for(const row of latest.result?.plan||[]){const key=row.day||'Day 1';(grouped[key]??=[]).push(row)}
 for(const [day,items] of Object.entries(grouped)){
   const card=el('article','card plan-card');card.append(el('h3','',day));const list=el('ol');
   for(const item of items){const li=el('li');li.append(el('strong','',item.task));li.append(el('span','priority-label',String(item.priority)));
    li.append(el('p','',`${item.type} · ${item.minutes} min · ${item.deadline}`));li.append(el('p','',item.reason));list.append(li)}
   card.append(list);host.append(card)
 }
 $('#plan-time').textContent=latest.finished_at?new Date(latest.finished_at).toLocaleString():'';
}
async function loadPlan(){if(!classId)return;const {data,error}=await client.from('ai_results').select('id,result,finished_at').eq('class_id',classId).eq('user_id',user.id).eq('kind','recovery').eq('status','done').order('finished_at',{ascending:false}).limit(20);if(error)throw error;
 latest=(data||[]).find(x=>x.result?.language===lang())||null;renderPlan()}
async function activate(id){classId=id;storeClass(user.id,id);updateNavClass(id);$('#class-link').href=`class.html?id=${encodeURIComponent(id)}`;$('#generate-plan').disabled=!id;await Promise.all([loadPlan(),loadQuota()]);}
async function generate(){if(!classId)return;const b=$('#generate-plan');busy(b,true);status('');
 try{const {data:pending,error:te}=await client.from('tasks').select('id').eq('class_id',classId).eq('user_id',user.id).eq('status','pending').limit(1);if(te)throw te;if(!pending?.length){toast(ft('noTasks'),true);return}
  const result=aiState(await invoke(client,'ai-generate',{kind:'recovery',class_id:classId,language:lang()}));
  latest={result,finished_at:new Date().toISOString()};renderPlan();toast(ft('planReady'));await loadQuota();
 }catch(e){error(e)}finally{busy(b,false)}
}
$('#generate-plan').addEventListener('click',generate);
$('#refresh-plan').addEventListener('click',async()=>{try{await Promise.all([loadPlan(),loadQuota()])}catch(e){error(e)}});
$('#class-select').addEventListener('change',async e=>{try{await activate(e.target.value)}catch(err){error(err)}});
async function init(){if(!requireConfigured($('#status')))return;installTranslations(client,()=>{renderPlan();if(user)loadPlan().catch(error)});
 try{user=await getSignedIn(client);const {data,error}=await client.from('classes').select('id,name').order('name');if(error)throw error;classes=data||[];
 classId=setSelectClasses($('#class-select'),classes,user.id,new URLSearchParams(location.search).get('class'));
 if(!classId){status('Join a class first.');return}await activate(classId)}catch(e){error(e)}}
await init();
