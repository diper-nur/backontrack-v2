/** Owner-only deletion, including private Storage objects and DB metadata. */
import {createClient} from 'npm:@supabase/supabase-js@2';
const ORIGINS=new Set(['https://diper-nur.github.io','http://localhost:5500','http://127.0.0.1:5500']);
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://diper-nur.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};}
function answer(req:Request,payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store'}})}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=='POST')return answer(req,{error:'Method not allowed'},405);
 if(req.headers.get('origin')&&!ORIGINS.has(req.headers.get('origin')!))return answer(req,{error:'Origin denied'},403);
 try{
  const url=Deno.env.get('SUPABASE_URL')!;
  const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')!;
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer=/^Bearer (.+)$/i.exec(req.headers.get('authorization')||'')?.[1];
  if(!bearer||!url||!pub||!secret)return answer(req,{error:'Unauthorized'},401);
  const {data:{user},error:authError}=await createClient(url,pub).auth.getUser(bearer);
  if(authError||!user)return answer(req,{error:'Session expired'},401);
  const {material_id}=await req.json();
  if(typeof material_id!=='string'||!/^[0-9a-f-]{36}$/i.test(material_id))return answer(req,{error:'Invalid material ID'},400);
  const admin=createClient(url,secret,{auth:{persistSession:false}});
  const {data:material,error:me}=await admin.from('materials').select('id,uploaded_by').eq('id',material_id).maybeSingle();
  if(me||!material)return answer(req,{error:'Material not found'},404);
  if(material.uploaded_by!==user.id)return answer(req,{error:'Only the uploader can delete this material'},403);
  const {data:files,error:fe}=await admin.from('material_files').select('storage_path').eq('material_id',material_id);
  if(fe)return answer(req,{error:'Cannot read material files'},500);
  if(files?.length){const {error:se}=await admin.storage.from('class-materials').remove(files.map((f:{storage_path:string})=>f.storage_path));if(se)throw se;}
  const {error:de}=await admin.from('materials').delete().eq('id',material_id).eq('uploaded_by',user.id);
  if(de)throw de;
  return answer(req,{ok:true});
 }catch(e){console.error('material-delete',e instanceof Error?e.message:String(e));return answer(req,{error:'Could not delete material; check server logs'},500)}
});
