function $(id){ return document.getElementById(id); }
const state = { hasDest:'no', wish:'', intl:'不限', from:'', days:5, prefs:[], transport:'公共交通', driveMax:3, budget:'', notes:'' };
const MODEL='gpt-4o-mini', TEMP=0.7;
const PREF_OPTIONS=['徒步','历史','带宠物','带娃','海边','自然','美食','博物馆','城市漫步','小众'];

function initUI(){
  const wrap=$('prefOpts'); wrap.innerHTML=''; PREF_OPTIONS.forEach(opt=>{ const id='pref_'+opt; const lbl=document.createElement('label'); lbl.style.display='flex'; lbl.style.alignItems='center'; lbl.style.gap='6px'; lbl.innerHTML=`<input type="checkbox" id="${id}" value="${opt}"/> ${opt}`; wrap.appendChild(lbl); });
  const has=$('hasDest'), destWrap=$('destWrap'), scopeWrap=$('scopeWrap');
  has.addEventListener('change',()=>{ const yes=has.value==='yes'; destWrap.style.display=yes?'block':'none'; scopeWrap.style.display=yes?'none':'block'; });
  const transportSel=$('transport'), driveWrap=$('driveWrap'); transportSel.addEventListener('change',()=>{ driveWrap.style.display=(transportSel.value==='自驾')?'block':'none'; });
  $('next1').onclick=()=>{ state.hasDest=$('hasDest').value; state.wish=$('wish').value.trim(); state.intl=$('intl').value; setStep(2); };
  $('back2').onclick=()=>setStep(1);
  $('next2').onclick=()=>{ state.from=$('from').value.trim(); state.days=Number($('days').value||5); setStep(3); };
  $('back3').onclick=()=>setStep(2);
  $('next3').onclick=()=>{ state.prefs=PREF_OPTIONS.filter(opt=>$('pref_'+opt).checked); state.transport=$('transport').value; state.driveMax=Number($('driveMax').value||3); setStep(4); };
  $('back4').onclick=()=>setStep(3);
  $('startGen').onclick=startGeneration;
  setStep(1);
}
function setStep(n){ for(let i=1;i<=4;i++){ $('step'+i).style.display=(i===n?'block':'none'); $('s'+i).classList.toggle('active',i===n); $('s'+i).classList.toggle('done',i<n);} }
function buildJSONPrompt(){ return { role:'user', content:
`你是资深旅行规划师。请**只输出 JSON**（不要任何额外文字），结构为：
{
  "overview": {
    "summary": "总体介绍，100字内",
    "budget": { "currency": "GBP/CNY/USD 等", "trip_total": {"min": 数字, "max": 数字},
                "accommodation_per_night": {"min": 数字, "max": 数字},
                "food_per_day": {"min": 数字, "max": 数字},
                "transport_total": {"min": 数字, "max": 数字},
                "activities_total": {"min": 数字, "max": 数字} }
  },
  "days": [
    { "title": "Day 1 - 城市名 / 主题",
      "morning": ["安排1","安排2"],
      "afternoon": ["安排1","安排2"],
      "evening": ["安排1","安排2"],
      "transport": "当日交通说明（步行/地铁/自驾；时间）",
      "budget": { "currency": "同上", "min": 数字, "max": 数字 },
      "notes": ["需预约","开放时间","备用方案"],
      "pois": [ { "name":"POI 名称", "type":"museum/restaurant/hotel/...","address":"地址" } ]
    }
  ],
  "links": { "official_sites": ["https://..."] }
}
请基于这些用户输入生成：
- 是否已有目的地: ${state.hasDest==='yes'?'是':'否'}
- 想去: ${state.wish||'未指定'}
- 出不出境: ${state.intl}
- 出发地: ${state.from||'未指定'}
- 天数: ${state.days}
- 偏好: ${state.prefs.join('、')||'未指定'}
- 出行方式: ${state.transport}${state.transport==='自驾'?'（每天最多驾驶'+state.driveMax+'小时）':''}
- 人均预算: ${($('budget').value||'未指定')}
- 其他要求: ${($('notes').value||'无')}
严格要求：1) 仅输出 JSON；字段名与上面一致；货币统一；数字用阿拉伯数字。2) 每日安排条理清晰，适合直接渲染为卡片。3) 不要输出外部 URL，除了 links.official_sites 最多 3 个官网。` }; }
async function startGeneration(){
  state.budget=$('budget').value.trim(); state.notes=$('notes').value.trim();
  $('status').textContent='正在生成（流式）…'; $('progBox').style.display='block'; $('outCard').style.display='block'; $('pretty').innerHTML=''; $('raw').textContent='';
  ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>$(id).disabled=true);
  const resp=await fetch('/api/openai-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,temperature:TEMP,messages:[{role:'system',content:'你是专业旅行规划师，仅输出有效 JSON（无额外文字）。'},buildJSONPrompt()]})});
  if(!resp.ok){ $('status').textContent='生成失败：'+resp.status; return; }
  const reader=resp.body.getReader(); const decoder=new TextDecoder(); let buf='', full='';
  while(true){ const {value,done}=await reader.read(); if(done)break; buf+=decoder.decode(value,{stream:true}); const parts=buf.split('\\n\\n'); buf=parts.pop();
    for(const p of parts){ if(!p.startsWith('data:'))continue; const data=p.replace(/^data:\\s*/,'').trim(); if(data==='[DONE]')break;
      try{ const json=JSON.parse(data); const delta=json.choices?.[0]?.delta?.content||''; if(delta){ full+=delta; $('status').textContent='已接收 '+full.length+' 字符…'; } }catch(e){} } }
  $('progBox').style.display='none';
  let parsed=null; try{ parsed=JSON.parse(full); }catch(e){ try{ const s=full.indexOf('{'); const e2=full.lastIndexOf('}'); parsed=JSON.parse(full.slice(s,e2+1)); }catch(_){} }
  if(!parsed){ $('status').textContent='生成的内容不是有效 JSON，请重试或改写问题。'; $('raw').textContent=full; return; }
  $('raw').textContent=JSON.stringify(parsed,null,2); renderWidgets(parsed); $('status').textContent='生成完成 ✅';
  ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>$(id).disabled=false);
  $('copyBtn').onclick=()=>{ navigator.clipboard.writeText(JSON.stringify(parsed,null,2)).then(()=>$('status').textContent='已复制 JSON'); };
  $('saveBtn').onclick=()=>{ const saves=JSON.parse(localStorage.getItem('gt_saves')||'[]'); saves.push({id:Date.now(),meta:{wish:state.wish,days:state.days,from:state.from},content:parsed}); localStorage.setItem('gt_saves',JSON.stringify(saves)); $('status').textContent='已保存到本地（浏览器）'; };
  $('dlJsonBtn').onclick=()=>downloadFile('application/json','plan.json',JSON.stringify(parsed,null,2));
  $('dlHtmlBtn').onclick=()=>downloadFile('text/html;charset=utf-8','plan.html',buildHTML(parsed));
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
    <div style="margin-top:8px">${escapeHtml(ov.summary||'')}</div>`;
  pretty.appendChild(ovCard);
  (plan.days||[]).forEach(d=>{
    const card=document.createElement('div'); card.className='day';
    card.innerHTML=`<h3>${escapeHtml(d.title||'Day')}</h3>
      ${renderBlock('上午',d.morning)} ${renderBlock('下午',d.afternoon)} ${renderBlock('晚上',d.evening)}
      <div class="pill">交通：${escapeHtml(d.transport||'')}</div>
      <div class="pill">当日预算：${fmtRange((d.budget||{}).currency,d.budget)}</div>
      ${renderPOIs(d.pois)} ${renderNotes(d.notes)}`;
    pretty.appendChild(card);
  });
}
function renderBlock(title,arr){ if(!arr||!arr.length)return ''; return `<div><b>${title}</b><ul>${arr.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')}</ul></div>`; }
function renderPOIs(pois){ if(!pois||!pois.length)return ''; return `<div><b>POI</b><ul>${pois.map(p=>'<li>'+escapeHtml(p.name||'')+'（'+escapeHtml(p.type||'')+'） · '+escapeHtml(p.address||'')+'</li>').join('')}</ul></div>`; }
function renderNotes(arr){ if(!arr||!arr.length)return ''; return `<div><b>备注</b><ul>${arr.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')}</ul></div>`; }
function fmtRange(cur,seg){ if(!seg)return '-'; const mn=seg.min, mx=seg.max; if(mn==null&&mx==null)return '-'; if(mn==null)return `${cur||''} ~${mx}`; if(mx==null)return `${cur||''} ${mn}~`; return `${cur||''} ${mn}–${mx}`; }
function escapeHtml(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function downloadFile(type,filename,content){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
function buildHTML(plan){ const head='<!doctype html><html><meta charset=\"utf-8\"><title>Go Travel</title><style>body{font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto;background:#f8fafc;color:#0f172a}.itinerary{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px}@media (max-width:860px){ .itinerary{grid-template-columns:1fr;} }.day{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;box-shadow:0 4px 14px rgba(0,0,0,.04)}.day h3{margin:0 0 8px}.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#ecfeff;border:1px solid #a5f3fc;color:#0369a1;font-size:12px;margin-right:6px}</style><body><div class=\"itinerary\" id=\"it\"></div><script>'; const tail='</script></body></html>'; const js=`var plan=${'${JSON.stringify(plan)}'};function h(t){return t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}function r(title,arr){if(!arr||!arr.length)return '';return '<div><b>'+title+'</b><ul>'+arr.map(x=>'<li>'+h(x)+'</li>').join('')+'</ul></div>';}function fr(cur,seg){if(!seg)return '-';var mn=seg.min,mx=seg.max;if(mn==null&&mx==null)return '-';if(mn==null)return (cur||'')+' ~'+mx; if(mx==null)return (cur||'')+' '+mn+'~'; return (cur||'')+' '+mn+'–'+mx;}var it=document.getElementById('it');var ov=plan.overview||{}, b=ov.budget||{}, cur=b.currency||'';var o=document.createElement('div'); o.className='day'; o.innerHTML='<h3>行程概览</h3>' + '<div class=\"pill\">总计：'+fr(cur,b.trip_total)+'</div>' + '<div class=\"pill\">住宿/晚：'+fr(cur,b.accommodation_per_night)+'</div>' + '<div class=\"pill\">餐饮/日：'+fr(cur,b.food_per_day)+'</div>' + '<div class=\"pill\">交通总计：'+fr(cur,b.transport_total)+'</div>' + '<div class=\"pill\">活动总计：'+fr(cur,b.activities_total)+'</div>' + '<div style=\"margin-top:8px\">'+h(ov.summary||'')+'</div>'; it.appendChild(o); (plan.days||[]).forEach(function(d){ var c=document.createElement('div'); c.className='day'; c.innerHTML='<h3>'+h(d.title||'Day')+'</h3>'+r('上午',d.morning)+r('下午',d.afternoon)+r('晚上',d.evening) + '<div class=\"pill\">交通：'+h(d.transport||'')+'</div>' + '<div class=\"pill\">当日预算：'+fr((d.budget||{}).currency,d.budget)+'</div>' + (d.pois&&d.pois.length?('<div><b>POI</b><ul>'+d.pois.map(p=>'<li>'+h(p.name||'')+'（'+h(p.type||'')+'） · '+h(p.address||'')+'</li>').join('')+'</ul></div>'):'') + (d.notes&&d.notes.length?('<div><b>备注</b><ul>'+d.notes.map(x=>'<li>'+h(x)+'</li>').join('')+'</ul></div>'):''); it.appendChild(c); });`; return head+js+tail; }
let deferredPrompt=null; const installBtn=$('installBtn'), guide=$('guide'), closeGuide=document.getElementById('closeGuide');
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; });
installBtn.addEventListener('click',async()=>{ const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent); if(deferredPrompt&&!isIOS){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; return;} guide.classList.add('show'); });
closeGuide.addEventListener('click',()=>guide.classList.remove('show'));
window.addEventListener('DOMContentLoaded',initUI);