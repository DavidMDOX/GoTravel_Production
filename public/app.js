function $(id){ return document.getElementById(id); }
const state = { hasDest:'no', wish:'', intl:'不限', from:'', days:5, prefs:[], transport:'公共交通', driveMax:3, budget:'', notes:'' };
const MODEL='gpt-4o'; const TEMP=0.4;
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
  $('status').textContent='正在生成…'; $('progBox').style.display='block'; $('outCard').style.display='block'; $('pretty').innerHTML=''; $('raw').textContent='';
  ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>$(id).disabled=true);

  const sys={role:'system',content:'你是专业旅行规划师。严格返回函数参数 JSON，不要输出任何解释。POI 务必包含 address 与一句话 intro；给出每日 timeline。'};
  const user={role:'user',content:buildUserPrompt()};

  try{
    const resp=await fetch('/api/plan-stream',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:MODEL,temperature:TMP_CLAMP(TEMP),messages:[sys,user],stream:false})
    });
    if(!resp.ok){
      $('status').textContent='生成失败：'+resp.status;
      $('progBox').style.display='none';
      return;
    }
    const plan=await resp.json();
    if(!plan || typeof plan!=='object'){
      $('status').textContent='解析失败：返回为空';
      $('progBox').style.display='none';
      return;
    }
    $('raw').textContent=JSON.stringify(plan,null,2);
    renderWidgets(plan);
    $('status').textContent='生成完成 ✅';
    ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>$(id).disabled=false);
    $('copyBtn').onclick=()=>{ navigator.clipboard.writeText(JSON.stringify(plan,null,2)).then(()=>$('status').textContent='已复制 JSON'); };
    $('saveBtn').onclick=()=>{ const saves=JSON.parse(localStorage.getItem('gt_saves')||'[]'); saves.push({id:Date.now(),meta:{wish:state.wish,days:state.days,from:state.from},content:plan}); localStorage.setItem('gt_saves',JSON.stringify(saves)); $('status').textContent='已保存到本地（浏览器）'; };
    $('dlJsonBtn').onclick=()=>download('application/json','plan.json',JSON.stringify(plan,null,2));
    $('dlHtmlBtn').onclick=()=>download('text/html;charset=utf-8','plan.html',exportHTML(plan));
  }catch(err){
    console.error(err);
    $('status').textContent='请求异常：'+(err&&err.message||'网络错误');
  }finally{
    $('progBox').style.display='none';
  }
}

function TMP_CLAMP(t){ if(typeof t!=='number') return 0.4; return Math.min(1,Math.max(0,t)); }

function buildUserPrompt(){
  return `输入：
- 是否已有目的地: ${state.hasDest==='yes'?'是':'否'}
- 想去: ${state.wish||'未指定'}
- 出不出境: ${state.intl}
- 出发地: ${state.from||'未指定'}
- 天数: ${state.days}
- 偏好: ${state.prefs.join('、')||'未指定'}
- 出行方式: ${state.transport}${state.transport==='自驾'?'（每天最多驾驶'+state.driveMax+'小时）':''}
- 人均预算: ${state.budget||'未指定'}
- 其他要求: ${state.notes||'无'}

请返回一次完整行程（概览 + 每日）。务必包含每日 timeline；每个 POI 要有 address + 一句话 intro，可选 url/门票/时长/贴士。`;
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
    const tl = (d.timeline && d.timeline.length)
      ? `<div style="margin:6px 0"><b>整体时间安排：</b><ul>${d.timeline.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`
      : '';
    const dining = d.dining ? `<div style="margin:6px 0"><b>就餐建议：</b>${d.dining.lunch?('午餐：'+esc(d.dining.lunch))+'；':''}${d.dining.dinner?('晚餐：'+esc(d.dining.dinner)):''}</div>` : '';
    card.innerHTML=`<h3>${esc(d.title||'Day')}</h3>
      ${tl}
      ${block('上午',d.morning)} ${block('下午',d.afternoon)} ${block('晚上',d.evening)}
      <div class="pill">交通：${esc(d.transport||'')}</div>
      <div class="pill">当日预算：${fmtRange((d.budget||{}).currency,d.budget)}</div>
      ${dining}
      ${pois(d.pois)}
      ${notes(d.notes)}`;
    pretty.appendChild(card);
  });
}

function block(t,arr){ if(!arr||!arr.length) return ''; return `<div><b>${t}</b><ul>${arr.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`; }

function pois(p){
  if(!p||!p.length) return '';
  return `<div><b>POI</b><ul>${
    p.map(x=>{
      const name=esc(x.name||'');
      const type=esc(x.type||'');
      const addr=esc(x.address||'');
      const intro=x.intro?`<div style="margin:2px 0">${esc(x.intro)}</div>`:'';
      const url=x.url?`<a href="${safeUrl(x.url)}" target="_blank" rel="noopener noreferrer">官网</a>`:'';
      const maps=`<a href="${mapsLink(x.name,x.address)}" target="_blank" rel="noopener noreferrer">地图</a>`;
      const ticket=x.ticket?` · 门票：${esc(x.ticket)}`:'';
      const stay=x.time_suggest?` · 停留：${esc(x.time_suggest)}`:'';
      const tips=x.tips?`<div style="color:#475569;margin-top:2px">小贴士：${esc(x.tips)}</div>`:'';
      return `<li>
        <div><b>${name}</b>（${type}） · ${addr} · ${maps}${url?` · ${url}`:''}${ticket}${stay}</div>
        ${intro}
        ${tips}
      </li>`;
    }).join('')
  }</ul></div>`;
}

function notes(n){ if(!n||!n.length) return ''; return `<div><b>备注</b><ul>${n.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`; }
function fmtRange(cur,seg){ if(!seg) return '-'; const {min,max}=seg; if(min==null&&max==null) return '-'; if(min==null) return `${cur||''} ~${max}`; if(max==null) return `${cur||''} ${min}~`; return `${cur||''} ${min}–${max}`; }
function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function safeUrl(u){ try{ const url=new URL(u); return url.href; }catch{ return '#'; } }
function mapsLink(name,address){
  const q = encodeURIComponent([name||'', address||''].filter(Boolean).join(' '));
  // 即使没有 address，也会用名称生成可用的搜索链接
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function download(type,name,content){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

function exportHTML(plan){
  const head='<!doctype html><html><meta charset="utf-8"><title>Go Travel</title><style>body{font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto;background:#f8fafc;color:#0f172a}.itinerary{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px}@media (max-width:860px){ .itinerary{grid-template-columns:1fr;} }.day{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;box-shadow:0 4px 14px rgba(0,0,0,.04)}.day h3{margin:0 0 8px}.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#ecfeff;border:1px solid #a5f3fc;color:#0369a1;font-size:12px;margin-right:6px}a{color:#0ea5e9;text-decoration:none}a:hover{text-decoration:underline}</style><body><div class="itinerary" id="it"></div><script>';
  const tail='</script></body></html>';
  const js = `
  var plan=${JSON.stringify(plan).replace(/</g,'\\u003c')};
  function h(t){return (t||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
  function fr(cur,seg){if(!seg)return '-';var mn=seg.min,mx=seg.max;if(mn==null&&mx==null)return '-';if(mn==null)return (cur||'')+' ~'+mx; if(mx==null)return (cur||'')+' '+mn+'~'; return (cur||'')+' '+mn+'–'+mx;}
  function mlink(n,a){var q=encodeURIComponent([n||'',a||''].filter(Boolean).join(' '));return 'https://www.google.com/maps/search/?api=1&query='+q;}
  var it=document.getElementById('it');
  var ov=plan.overview||{}, b=ov.budget||{}, cur=b.currency||'';
  var o=document.createElement('div'); o.className='day';
  o.innerHTML='<h3>行程概览</h3>' + '<div class="pill">总计：'+fr(cur,b.trip_total)+'</div>' + '<div class="pill">住宿/晚：'+fr(cur,b.accommodation_per_night)+'</div>' + '<div class="pill">餐饮/日：'+fr(cur,b.food_per_day)+'</div>' + '<div class="pill">交通总计：'+fr(cur,b.transport_total)+'</div>' + '<div class="pill">活动总计：'+fr(cur,b.activities_total)+'</div>' + '<div style="margin-top:8px">'+h(ov.summary||'')+'</div>'; it.appendChild(o);
  (plan.days||[]).forEach(function(d){
    var c=document.createElement('div'); c.className='day';
    var tl=d.timeline&&d.timeline.length?('<div style="margin:6px 0"><b>整体时间安排：</b><ul>'+d.timeline.map(h).map(function(t){return '<li>'+t+'</li>';}).join('')+'</ul></div>'):'';
    var dining=d.dining?('<div style="margin:6px 0"><b>就餐建议：</b>'+(d.dining.lunch?('午餐：'+h(d.dining.lunch))+'；':'')+(d.dining.dinner?('晚餐：'+h(d.dining.dinner)):'')+'</div>'):'';
    var pois=(d.pois||[]).map(function(x){
      var url = x.url ? '<a href=\"'+x.url+'\" target=\"_blank\" rel=\"noopener noreferrer\">官网</a>' : '';
      var maps = '<a href=\"'+mlink(x.name,x.address)+'\" target=\"_blank\" rel=\"noopener noreferrer\">地图</a>';
      var ticket = x.ticket ? ' · 门票：'+h(x.ticket) : '';
      var stay = x.time_suggest ? ' · 停留：'+h(x.time_suggest) : '';
      var intro = x.intro ? '<div style=\"margin:2px 0\">'+h(x.intro)+'</div>' : '';
      var tips = x.tips ? '<div style=\"color:#475569;margin-top:2px\">小贴士：'+h(x.tips)+'</div>' : '';
      return '<li><div><b>'+h(x.name||'')+'</b>（'+h(x.type||'')+'） · '+h(x.address||'')+' · '+maps+(url?(' · '+url):'')+ticket+stay+'</div>'+intro+tips+'</li>';
    }).join('');
    c.innerHTML='<h3>'+h(d.title||'Day')+'</h3>'+tl
      +(d.morning&&d.morning.length?('<div><b>上午</b><ul>'+d.morning.map(h).map(function(t){return '<li>'+t+'</li>';}).join('')+'</ul></div>'):'')
      +(d.afternoon&&d.afternoon.length?('<div><b>下午</b><ul>'+d.afternoon.map(h).map(function(t){return '<li>'+t+'</li>';}).join('')+'</ul></div>'):'')
      +(d.evening&&d.evening.length?('<div><b>晚上</b><ul>'+d.evening.map(h).map(function(t){return '<li>'+t+'</li>';}).join('')+'</ul></div>'):'')
      +'<div class=\"pill\">交通：'+h(d.transport||'')+'</div>'
      +'<div class=\"pill\">当日预算：'+fr((d.budget||{}).currency,d.budget)+'</div>'
      +dining
      + (pois?('<div><b>POI</b><ul>'+pois+'</ul></div>'):'')
      + (d.notes&&d.notes.length?('<div><b>备注</b><ul>'+d.notes.map(h).map(function(t){return '<li>'+t+'</li>';}).join('')+'</ul></div>'):'');
    it.appendChild(c);
  });
  `;
  return head+js+tail;
}

window.addEventListener('DOMContentLoaded', initUI);
