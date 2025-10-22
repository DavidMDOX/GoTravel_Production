function $(id){ return document.getElementById(id); }
const state = { intl:'不限', wish:'', from:'', days:5, prefs:'', transport:'', budget:'', notes:'', model:'gpt-4o-mini', temp:0.7 };

function setStep(n){ for(let i=1;i<=4;i++){ $('step'+i).style.display=(i===n?'block':'none'); $('s'+i).classList.toggle('active',i===n); $('s'+i).classList.toggle('done',i<n);} }
function initSteps(){
  $('next1').onclick=()=>{ state.intl=$('intl').value.trim(); state.wish=$('wish').value.trim(); setStep(2); };
  $('back2').onclick=()=>setStep(1);
  $('next2').onclick=()=>{ state.from=$('from').value.trim(); state.days=Number($('days').value||5); setStep(3); };
  $('back3').onclick=()=>setStep(2);
  $('next3').onclick=()=>{ state.prefs=$('prefs').value.trim(); state.transport=$('transport').value.trim(); setStep(4); };
  $('back4').onclick=()=>setStep(3);
  $('startGen').onclick=startGeneration;
  setStep(1);
}
function buildPrompt(){ return `你是资深旅行规划师。请基于以下信息，生成**美观的 Markdown 行程卡**：

【出行信息】
- 是否出境：${state.intl}
- 想去：${state.wish || '未指定'}
- 出发地：${state.from || '未指定'}
- 天数：${state.days} 天
- 偏好：${state.prefs || '未指定'}
- 出行方式：${state.transport || '未指定'}
- 人均预算：${state.budget || '未指定'}
- 其他要求：${state.notes || '无'}

【输出要求】
1) 先给【行程概览卡】：总体路线、每日关键词、预算拆分（交通/餐饮/门票/住宿/其他），总预算。
2) 再给【每日行程卡】（Day 1..Day N）：用卡片式 Markdown 展示，包含：
   - 上午/下午/晚上安排与大致时长
   - 交通方式与步行距离估计（公里/分钟）
   - 建议餐厅（名称/人均）与必吃推荐
   - 门票/预约/排队提醒
   - 备用方案（天气或人多时）
   - 当日预算（以货币符号表示）
3) 末尾给【贴心提醒】（交通卡/网约车/小费/插头/语言/支付/安全等）。
4) 使用二级/三级标题与列表，正文不出现多余解释。`; }

async function startGeneration(){
  state.budget=$('budget').value.trim(); state.notes=$('notes').value.trim();
  state.model=$('model').value.trim()||'gpt-4o-mini'; state.temp=Number($('temp').value||0.7);
  $('status').textContent='正在生成（流式）…'; $('outCard').style.display='block'; $('raw').textContent=''; $('pretty').innerHTML='';

  const system={role:'system',content:'你是专业旅行规划师，会用清晰且美观的 Markdown 卡片生成行程。'};
  const user={role:'user',content:buildPrompt()};

  const resp=await fetch('/api/openai-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:state.model,temperature:state.temp,messages:[system,user]})});
  if(!resp.ok){ $('status').textContent='生成失败：'+resp.status; return; }

  const reader=resp.body.getReader(); const decoder=new TextDecoder(); let buf=''; let full='';
  while(true){ const {value,done}=await reader.read(); if(done)break; buf+=decoder.decode(value,{stream:true}); const parts=buf.split('\n\n'); buf=parts.pop();
    for(const p of parts){ if(!p.startsWith('data:'))continue; const data=p.replace(/^data:\s*/,'').trim(); if(data==='[DONE]')break;
      try{ const json=JSON.parse(data); const delta=json.choices?.[0]?.delta?.content||''; if(delta){ full+=delta; $('raw').textContent=full; renderPretty(full); } }catch(e){} } }
  $('status').textContent='生成完成 ✅'; $('saveBtn').disabled=false; $('copyBtn').disabled=false; $('dlBtn').disabled=false;
}

function renderPretty(md){
  const pretty=$('pretty'); const days=[]; const lines=md.split('\n'); let cur=null;
  for(let line of lines){ const m=line.match(/^\s*#+\s*(Day\s*\d+.*?)$/i); if(m){ if(cur)days.push(cur); cur={title:m[1],content:[]}; } else if(cur){ cur.content.push(line);} }
  if(cur)days.push(cur);
  const overviewMatch=md.match(/^\s*##\s*(.*概览.*|.*总览.*)$/m); let overview=''; if(overviewMatch){ const idx=md.indexOf(overviewMatch[0]); const rest=md.slice(idx); const next=rest.indexOf('\n## '); overview=next>0?rest.slice(0,next):rest; }
  let html=''; if(overview){ html+=`<div class="day"><h3>行程概览</h3><div>${escapeHtml(overview)}</div></div>`; }
  for(const d of days){ html+=`<div class="day"><h3>${escapeHtml(d.title)}</h3><div>${escapeHtml(d.content.join('\n'))}</div></div>`; }
  pretty.innerHTML=html;
}
function escapeHtml(s){ return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function setupIO(){
  $('copyBtn').onclick=()=>{ const txt=$('raw').innerText||''; navigator.clipboard.writeText(txt).then(()=>$('status').textContent='已复制到剪贴板'); };
  $('dlBtn').onclick=()=>{ const txt=$('raw').innerText||''; const d=new Date(); const name=`GoTravel_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}.md`; const blob=new Blob([txt],{type:'text/markdown;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); };
  $('saveBtn').onclick=()=>{ const txt=$('raw').innerText||''; const saves=JSON.parse(localStorage.getItem('gt_saves')||'[]'); saves.push({id:Date.now(),meta:{wish:state.wish,days:state.days,from:state.from},content:txt}); localStorage.setItem('gt_saves',JSON.stringify(saves)); $('status').textContent='已保存到本地（浏览器）'; };
}
window.addEventListener('DOMContentLoaded',()=>{ initSteps(); setupIO(); });
