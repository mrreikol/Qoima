import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createInventoryService } from '../src/services/inventoryApi.js';
import { categoryDeletionPreview, availableCategoryFilter, categoryDeletionRefreshState } from '../src/data/categoryDeletion.js';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('category deletion SQL: own active/archive moves, preserved inventory/history/operations, denied access and atomic rollback (single local PGlite connection)', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon nologin; create role authenticated nologin;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to public;
   alter default privileges in schema public grant all on tables to anon,authenticated;
   alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  for(const name of ['20261102180000_inventory_foundation.sql','20261103090000_stock_operations.sql','20261103193000_category_deletion.sql'])
   await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  await db.query('insert into auth.users values ($1),($2)',[A,B]);
  const asUser=async(id,role='authenticated')=>{ await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec(`set role ${role}`); };
  const category=async(name)=>(await db.query('insert into public.categories(name) values($1) returning id',[name])).rows[0].id;
  const product=async(cat,sku,archived=false)=>{
   const id=(await db.query("select id from public.create_product($1,$2,$3,'',3)",[sku,sku,cat])).rows[0].id;
   if(archived) await db.query('update public.products set is_archived=true where id=$1',[id]);
   return id;
  };
  const snapshot=async()=>{const data={};for(const table of ['categories','products','stock_movements','stock_operations']) data[table]=(await db.query(`select * from public.${table} order by ${table==='stock_operations'?'operation_id':'id'}`)).rows;return data;};
  const remove=async(src,action,dest=null)=>(await db.query('select * from public.delete_category($1,$2,$3)',[src,action,dest])).rows[0];
  const deny=async(fn,code)=>assert.rejects(fn,e=>e.code===code);
  await asUser(A);
  const src=await category('Move'), dst=await category('Destination'), uncat=await category('Uncategorize'), empty=await category('Empty');
  const p1=await product(src,'ACTIVE'), p2=await product(src,'ARCHIVED',true);
  await product(uncat,'UNCAT-A'); await product(uncat,'UNCAT-B',true);
  await db.query("select public.change_stock($1,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','IN',2,'Receipt')",[p1]);
  const before=await snapshot();
  await asUser(B);const foreign=await category('Foreign');
  await deny(()=>remove(src,'uncategorized'),'42501');
  await asUser(''); await deny(()=>remove(src,'empty'),'42501');
  await asUser(A,'anon'); await deny(()=>remove(src,'uncategorized'),'42501');
  await asUser(A);
  for(const [action,destination,code] of [['move',src,'22023'],['move',foreign,'42501'],['move',null,'22023'],['move','dddddddd-dddd-4ddd-8ddd-dddddddddddd','42501'],['bad',null,'22023'],['uncategorized',dst,'22023'],['empty',null,'22023']])
   await deny(()=>remove(src,action,destination),code);
  assert.deepEqual(await snapshot(),before,'failed access/destination checks change nothing for owner A');
  await deny(()=>db.query('delete from public.categories where id=$1',[empty]),'42501');
  assert.equal(Number((await remove(empty,'empty')).affected_products),0);
  assert.equal(Number((await remove(src,'move',dst)).affected_products),2);
  assert.equal(Number((await remove(uncat,'uncategorized')).affected_products),2);
  let after=await snapshot();
  assert.equal(after.products.length,before.products.length);
  for(const old of before.products){const current=after.products.find(p=>p.id===old.id); const {category_id,updated_at,...unchanged}=current; const {category_id:oldCategory,updated_at:oldTime,...original}=old; assert.deepEqual(unchanged,original);assert.equal(category_id,[p1,p2].includes(old.id)?dst:null);assert.ok(updated_at);assert.ok(oldCategory);assert.ok(oldTime);}
  assert.deepEqual(after.stock_movements,before.stock_movements);
  assert.deepEqual(after.stock_operations,before.stock_operations);
  const race=await category('Initially empty'); await product(race,'NEW-BEFORE-CONFIRM');
  await deny(()=>remove(race,'empty'),'22023');
  const rollback=await category('Late failure'); await product(rollback,'ROLLBACK');
  const rollbackBefore=await snapshot();
  await db.exec('reset role');
  await db.exec(`create function public.test_category_failure() returns trigger language plpgsql as $$begin raise exception 'Injected deletion failure'; end$$;
   create trigger test_category_failure before delete on public.categories for each row execute function public.test_category_failure();`);
  await asUser(A); await deny(()=>remove(rollback,'move',dst),'P0001');
  assert.deepEqual(await snapshot(),rollbackBefore,'failure after product update rolls back metadata and category deletion');
  await db.exec('reset role; drop trigger test_category_failure on public.categories; drop function public.test_category_failure();');
  await asUser(A); await db.query('update public.categories set name=$1 where id=$2',['Renamed',dst]);
  await db.query('update public.products set category_id=$1 where id=$2',[null,p1]);
  await product(dst,'STILL-CAN-CREATE');
  await asUser(B); await product(foreign,'B-OWN'); await remove(foreign,'uncategorized');
 } finally { await db.close(); }
});

test('deletion preview counts archives and deleted category filters clear only unavailable selections',()=>{
 assert.deepEqual(categoryDeletionPreview('a',[{category_id:'a'},{category_id:'a',is_archived:true},{category_id:'b'}]),{count:2,archived:1});
 assert.equal(availableCategoryFilter('a',[{id:'a'}]),'a'); assert.equal(availableCategoryFilter('a',[]),''); assert.equal(availableCategoryFilter('uncategorized',[]),'uncategorized');
 const base={revision:4,loading:false,error:'',categories:[{id:'a'}]};
 assert.equal(categoryDeletionRefreshState(4,base,'a'),'waiting');
 assert.equal(categoryDeletionRefreshState(3,{...base,loading:true},'a'),'waiting');
 assert.equal(categoryDeletionRefreshState(3,{...base,error:'Offline'},'a'),'failed');
 assert.equal(categoryDeletionRefreshState(3,base,'a'),'ready');
 assert.equal(categoryDeletionRefreshState(3,{...base,categories:[]},'a'),'gone');
});

test('service uses ordinary RPC parameters and treats unknown outcomes/malformed responses as uncertain',async()=>{
 const calls=[];let response={data:[{deleted_category_id:'a',affected_products:2}],error:null};
 const service=createInventoryService({rpc:(name,args)=>{calls.push({name,args});return{abortSignal:async()=>response};}});
 assert.equal((await service.deleteCategory({categoryId:'a',action:'move',destinationId:'b'})).affected_products,2);
 assert.deepEqual(calls[0],{name:'delete_category',args:{p_category_id:'a',p_action:'move',p_destination_category_id:'b'}});
 for(const code of ['PGRST202','42501','22023','40P01','40001']){response={error:{code}};await assert.rejects(()=>service.deleteCategory({categoryId:'a',action:'empty'}),e=>!e.uncertain);}
 for(const value of [{error:{message:'Network failure'}},{data:[]},{data:[{deleted_category_id:'other',affected_products:2}]}]){response=value;await assert.rejects(()=>service.deleteCategory({categoryId:'a',action:'empty'}),e=>e.uncertain);}
});

test('actual deletion dialog previews archived products and requires confirmation without enabling nonempty deletion by default',async()=>{
 const { createServer }=await import('vite'); const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,ws:false,hmr:false}});
 const previous=globalThis.document;globalThis.document={activeElement:null};
 try{
  const {default:Dialog}=await server.ssrLoadModule('/src/components/DeleteCategoryDialog.jsx');
  const category={id:'a',name:'Office supplies'};
  const render=products=>renderToStaticMarkup(React.createElement(Dialog,{category,inventory:{products,categories:[category,{id:'b',name:'Destination'}],revision:1,loading:false,error:''},onClose(){},onComplete(){}}));
  const full=render([{category_id:'a'},{category_id:'a',is_archived:true},{category_id:'b'}]);
  assert.match(full,/Office supplies/);assert.match(full,/2 affected products, including 1 archived/);
  assert.match(full,/Choose an action/);assert.match(full,/Leave products uncategorized/);assert.match(full,/Move products to another category/);
  assert.match(full,/<button[^>]*disabled=""[^>]*>Delete category/);
  const empty=render([]);assert.match(empty,/Only the empty category will be deleted/);assert.match(empty,/If products are assigned before confirmation/);
  assert.match(empty,/>Cancel<\/button>/);assert.doesNotMatch(empty,/<button[^>]*disabled=""[^>]*>Delete category/);
 }finally{globalThis.document=previous;await server.close();}
});
