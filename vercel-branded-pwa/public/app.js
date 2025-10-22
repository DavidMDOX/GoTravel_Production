function $(id){ return document.getElementById(id); }

function escapeHtml(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function buildPrompt({ dest, days, budget, prefs, notes }){
  return `你是资深旅行规划师。根据以下需求输出可复制的 Markdown 行程：
- 目的地：${dest}
- 天数：${days} 天
- 预算：${budget || "未指定"}
- 偏好：${prefs || "未指定"}
- 额外：${notes || "无"}

请包含：1) 总览与预算拆分 2) Day 1..N 每日清单（交通/时长/用餐/门票/备用方案）3) 每日与总预算 4) 注意事项（交通卡/小费/插头/语言等）。`;
}

async function callAPI({ model, messages, temperature }){
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature })
  });
  if (!res.ok) throw new Error('API 调用失败：' + res.status);
  return await res.json();
}

async function generate(state){
  const status = $('status');
  const result = $('result');
  const model = $('model').value.trim() || 'gpt-4o-mini';
  const temp = Number($('temp').value || 0.7);

  if (!state.dest || !state.days){ status.textContent = '请填写目的地和天数'; return; }

  $('genBtn').disabled = true; $('regenBtn').disabled = true; $('copyBtn').disabled = true; $('dlBtn').disabled = true;
  status.textContent = '正在生成行程…';

  const system = { role: 'system', content: '你是专业旅行规划师，会用清晰的 Markdown 生成行程。' };
  const user = { role: 'user', content: buildPrompt(state) };

  try {
    const data = await callAPI({ model, messages: [system, user], temperature: temp });
    const text = data.choices?.[0]?.message?.content?.trim() || '(无内容)';
    result.innerHTML = '<pre>' + escapeHtml(text) + '</pre>';
    status.textContent = '生成完成 ✅';
    $('regenBtn').disabled = false; $('copyBtn').disabled = false; $('dlBtn').disabled = false;
  } catch(e){
    console.error(e);
    status.textContent = e.message || '生成失败';
  } finally {
    $('genBtn').disabled = false;
  }
}

function download(filename, text){
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', () => {
  const state = () => ({
    dest: $('dest').value.trim(),
    days: Number($('days').value || 0),
    budget: $('budget').value.trim(),
    prefs: $('prefs').value.trim(),
    notes: $('notes').value.trim()
  });

  $('genBtn').addEventListener('click', () => generate(state()));
  $('regenBtn').addEventListener('click', () => generate(state()));
  $('copyBtn').addEventListener('click', () => {
    const txt = $('result').innerText || '';
    navigator.clipboard.writeText(txt).then(() => { $('status').textContent = '已复制到剪贴板'; });
  });
  $('dlBtn').addEventListener('click', () => {
    const txt = $('result').innerText || '';
    const d = new Date();
    const name = `GoTravel_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}.md`;
    download(name, txt);
  });
});
