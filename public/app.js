function $(id){ return document.getElementById(id); }
const state = { hasDest:'no', wish:'', intl:'不限', from:'', days:5, prefs:[], transport:'公共交通', driveMax:3, budget:'', notes:'' };
const MODEL='gpt-4o', TEMP=0.4;
const PREF_OPTIONS=['徒步','历史','带宠物','带娃','海边','自然','美食','博物馆','城市漫步','小众'];

function initUI(){
  const wrap=$('prefChips'); PREF_OPTIONS.forEach(opt=>{ const el=document.createElement('div'); el.className='chip-btn'; el.textContent=opt; el.onclick=()=>{ el.classList.toggle('active'); }; wrap.appendChild(el); });
  const has=$('hasDest'), destWrap=$('destWrap'), scopeWrap=$('scopeWrap');
  has.addEventListener('change',()=>{ const yes=has.value==='yes'; destWrap.style.display=yes?'block':'none'; scopeWrap.style.display=yes?'none':'block'; });
  const transportSel=$('transport'), driveWrap=$('driveWrap'); transportSel.addEventListener('change',()=>{ driveWrap.style.display=(transportSel.value==='自驾')?'block':'none'; });
  $('next1').onclick=()=>{ state.hasDest=$('hasDest').value; state.wish=$('wish').value.trim(); state.intl=$('intl').value; setStep(2); };
  $('back2').onclick=()=>setStep(1);
  $('next2').onclick=()=>{ state.from=$('from').value.trim(); state.days=Number($('days').value||5); setStep(3); };
  $('back3').onclick=()=>setStep(2);
  $('next3').onclick=()=>{ state.prefs=[...wrap.querySelectorAll('.chip-btn.active')].map(x=>x.textContent); state.transport=$('transport').value; state.driveMax=Number($('driveMax').value||3); setStep(4); };
  $('back4').onclick=()=>setStep(3);
  $('startGen').onclick=startGeneration;
  setStep(1);

  let deferredPrompt=null; const installBtn=$('installBtn'); const guide=$('guide'); const guideText=$('guideText');
  window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; });
  installBtn.onclick=async()=>{
    const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(deferredPrompt && !isIOS){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; return; }
    let html=''; if(isIOS){ html='<p>iPhone/iPad（Safari）：</p><ul><li>点底部<b>分享</b>（方框+箭头）</li><li>选择<b>添加到主屏幕</b></li></ul>'; }
    else if(/android/i.test(navigator.userAgent)){ html='<p>Android（Chrome）：</p><ul><li>右上角<b>⋮</b> → <b>添加到主屏幕</b>或<b>安装应用</b></li></ul>'; }
    else { html='<p>桌面浏览器：</p><ul><li>地址栏右侧<b>安装</b>图标，或菜单中的<b>安装此站点为应用</b></li></ul>'; }
    guideText.innerHTML=html; guide.classList.add('show'); guide.onclick=()=>guide.classList.remove('show');
  };
}
function setStep(n){ for(let i=1;i<=4;i++){ $('step'+i).style.display=(i===n?'block':'none'); $('s'+i).classList.toggle('active',i===n); $('s'+i).classList.toggle('done',i<n);} }

async function startGeneration(){
  state.budget=$('budget').value.trim(); state.notes=$('notes').value.trim();
  $('status').textContent='正在生成（稳定 JSON 模式）…'; $('progBox').style.display='block'; $('outCard').style.display='block'; $('pretty').innerHTML=''; $('raw').textContent=''; ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>$(id).disabled=true);
  const sys={role:'system',content:'你是专业旅行规划师。严格返回函数参数 JSON，不要输出任何解释。'};
  const user={role:'user',content:buildUserPrompt()};
  const resp=await fetch('/api/plan-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,temperature:TEMP,messages:[sys,user]})});
  if(!resp.ok){ $('status').textContent='生成失败：'+resp.status; return; }
  const reader=resp.body.getReader(); const decoder=new TextDecoder(); let buf='', args='';
  while(true){ const {value,done}=await reader.read(); if(done)break; buf+=decoder.decode(value,{stream:true}); const parts=buf.split('\\n\\n'); buf=parts.pop();
    for(const p of parts){ if(!p.startsWith('data:')) continue; const data=p.slice(5).trim(); if(data==='[DONE]') break;
      try{ const j=JSON.parse(data); const delta=j.choices?.[0]?.delta; const tc=delta?.tool_calls?.[0]; if(tc?.function?.arguments){ args+=tc.function.arguments; $('status').textContent='已接收 '+args.length+' 字符…'; } }catch(e){} } }
  $('progBox').style.display='none';
  let plan=null; try{ plan=JSON.parse(args); }catch(e){ try{ const s=args.indexOf('{'); const e2=args.lastIndexOf('}'); plan=JSON.parse(args.slice(s,e2+1)); }catch(_){ } }
  if(!plan){ $('status').textContent='解析失败，请重试。'; $('raw').textContent=args||'(空)'; return; }
  $('raw').textContent=JSON.stringify(plan,null,2); renderWidgets(plan); $('status').textContent='生成完成 ✅';
  ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>$(id).disabled=false);
  $('copyBtn').onclick=()=>{ navigator.clipboard.writeText(JSON.stringify(plan,null,2)).then(()=>$('status').textContent='已复制 JSON'); };
  $('saveBtn').onclick=()=>{ const saves=JSON.parse(localStorage.getItem('gt_saves')||'[]'); saves.push({id:Date.now(),meta:{wish:state.wish,days:state.days,from:state.from},content:plan}); localStorage.setItem('gt_saves',JSON.stringify(saves)); $('status').textContent='已保存到本地（浏览器）'; };
  $('dlJsonBtn').onclick=()=>download('application/json','plan.json',JSON.stringify(plan,null,2));
  $('dlHtmlBtn').onclick=()=>download('text/html;charset=utf-8','plan.html',exportHTML(plan));
}

function buildUserPrompt(){
  return `输入：
- 是否已有目的地: ${state.hasDest==='yes'?'是':'否'}
- 想去: ${state.wish||'未指定'}
- 出不出境: ${state.intl}
- 出发地: ${state.from||'未指定'}
- 天数: ${state.days}
- 偏好: ${state.prefs.join('、')||'未指定'}
- 出行方式: ${state.transport}${state.transport==='自驾'?'（每天最多驾驶'+state.driveMax+'小时）':''}
- 人均预算: ${($('budget').value||'未指定')}
- 其他要求: ${($('notes').value||'无')}

请返回一次完整行程（概览 + 每日）。`;
}

function renderWidgets(plan){
  const pretty=$('pretty'); pretty.innerHTML='';
  const ov=plan.overview||{}; const b=ov.budget||{}; const cur=b.currency||'';
  const ovCard=document.createElement('div'); ovCard.className='day';
  ovCard.innerHTML=`<h3>行程概览</h3>
    <div class="pill">总计：${fmtRange(cur,b.trip_total)}</div>
    <div class="pill">住宿/晚：${fmtRange(cur,b.accommodation_per_night)}</div>
    <div class="pill">餐饮/日：${fmtRange(cur,b.food_per_day)}</div>
    <div class="pill">交通总计：${fmtRange(cur,b.transport_total)}</div>
    <div class="pill">活动总计：${fmtRange(cur,b.activities_total)}</div>
    <div style="margin-top:8px">${esc(ov.summary||'')}</div>`;
  pretty.appendChild(ovCard);
  (plan.days||[]).forEach(d=>{
    const card=document.createElement('div'); card.className='day';
    card.innerHTML=`<h3>${esc(d.title||'Day')}</h3>
      ${block('上午',d.morning)} ${block('下午',d.afternoon)} ${block('晚上',d.evening)}
      <div class="pill">交通：${esc(d.transport||'')}</div>
      <div class="pill">当日预算：${fmtRange((d.budget||{}).currency,d.budget)}</div>
      ${pois(d.pois)} ${notes(d.notes)}`;
    pretty.appendChild(card);
  });
}
function block(t,arr){ if(!arr||!arr.length) return ''; return `<div><b>${t}</b><ul>${arr.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`; }
function pois(p){ if(!p||!p.length) return ''; return `<div><b>POI</b><ul>${p.map(x=>'<li>'+esc(x.name||'')+'（'+esc(x.type||'')+'） · '+esc(x.address||'')+'</li>').join('')}</ul></div>`; }
function notes(n){ if(!n||!n.length) return ''; return `<div><b>备注</b><ul>${n.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`; }
function fmtRange(cur,seg){ if(!seg) return '-'; const {min,max}=seg; if(min==null&&max==null) return '-'; if(min==null) return `${cur||''} ~${max}`; if(max==null) return `${cur||''} ${min}~`; return `${cur||''} ${min}–${max}`; }
function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function download(type,name,content){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
function exportHTML(plan){ const head='<!doctype html><html><meta charset=\"utf-8\"><title>Go Travel</title><style>body{font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto;background:#f8fafc;color:#0f172a}.itinerary{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px}@media (max-width:860px){ .itinerary{grid-template-columns:1fr;} }.day{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;box-shadow:0 4px 14px rgba(0,0,0,.04)}.day h3{margin:0 0 8px}.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#ecfeff;border:1px solid #a5f3fc;color:#0369a1;font-size:12px;margin-right:6px}</style><body><div class=\"itinerary\" id=\"it\"></div><script>'; const tail='</script></body></html>'; const js=`var plan=${'${JSON.stringify(plan)}'};function h(t){return t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}function r(title,arr){if(!arr||!arr.length)return '';return '<div><b>'+title+'</b><ul>'+arr.map(x=>'<li>'+h(x)+'</li>').join('')+'</ul></div>';}function fr(cur,seg){if(!seg)return '-';var mn=seg.min,mx=seg.max;if(mn==null&&mx==null)return '-';if(mn==null)return (cur||'')+' ~'+mx; if(mx==null)return (cur||'')+' '+mn+'~'; return (cur||'')+' '+mn+'–'+mx;}var it=document.getElementById('it');var ov=plan.overview||{}, b=ov.budget||{}, cur=b.currency||'';var o=document.createElement('div'); o.className='day'; o.innerHTML='<h3>行程概览</h3>' + '<div class=\"pill\">总计：'+fr(cur,b.trip_total)+'</div>' + '<div class=\"pill\">住宿/晚：'+fr(cur,b.accommodation_per_night)+'</div>' + '<div class=\"pill\">餐饮/日：'+fr(cur,b.food_per_day)+'</div>' + '<div class=\"pill\">交通总计：'+fr(cur,b.transport_total)+'</div>' + '<div class=\"pill\">活动总计：'+fr(cur,b.activities_total)+'</div>' + '<div style=\"margin-top:8px\">'+h(ov.summary||'')+'</div>'; it.appendChild(o); (plan.days||[]).forEach(function(d){ var c=document.createElement('div'); c.className='day'; c.innerHTML='<h3>'+h(d.title||'Day')+'</h3>'+r('上午',d.morning)+r('下午',d.afternoon)+r('晚上',d.evening) + '<div class=\"pill\">交通：'+h(d.transport||'')+'</div>' + '<div class=\"pill\">当日预算：'+fr((d.budget||{}).currency,d.budget)+'</div>' + (d.pois&&d.pois.length?('<div><b>POI</b><ul>'+d.pois.map(p=>'<li>'+h(p.name||'')+'（'+h(p.type||'')+'） · '+h(p.address||'')+'</li>').join('')+'</ul></div>'):'') + (d.notes&&d.notes.length?('<div><b>备注</b><ul>'+d.notes.map(x=>'<li>'+h(x)+'</li>').join('')+'</ul></div>'):''); it.appendChild(c); });`; return head+js+tail; }
window.addEventListener('DOMContentLoaded', initUI);