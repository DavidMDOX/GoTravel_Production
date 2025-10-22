<script>
// ===== 简易选择器 =====
const $ = (id) => document.getElementById(id);

// 这些 ID/元素建议在 index.html 里存在：
// - 文本输入：<textarea id="prompt"></textarea>
// - 触发按钮：<button id="genBtn">生成</button>
// - 状态条：  <div id="status"></div>
// - 进度盒：  <div id="progBox" style="display:none"></div>
// - 原始输出：<pre id="raw"></pre>
// - 控制按钮：<button id="saveBtn" disabled>保存</button>
//           <button id="copyBtn" disabled>复制</button>
//           <button id="dlJsonBtn" disabled>下载JSON</button>
//           <button id="dlHtmlBtn" disabled>下载HTML</button>

async function startGeneration () {
  const promptEl = $('prompt') || document.querySelector('textarea');
  const statusEl = $('status');
  const rawEl = $('raw');

  const prompt = (promptEl?.value || '').trim();
  if (!prompt) {
    alert('请输入内容');
    return;
  }

  // UI 状态
  if ($('progBox')) $('progBox').style.display = 'block';
  if (statusEl) statusEl.textContent = '正在生成…';
  if (rawEl) rawEl.textContent = '';
  ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>{
    const b=$(id); if(b) b.disabled=true;
  });

  let resp;
  try {
    resp = await fetch('/api/plan-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
  } catch (e) {
    if (statusEl) statusEl.textContent = '网络错误，请重试。';
    return;
  }

  if (!resp.ok || !resp.body) {
    if (statusEl) statusEl.textContent = '生成失败（后端未返回流）。';
    return;
  }

  // —— 关键修复：同时累积 arguments 与 content，并对两路都做“花括号截取再 parse”兜底 ——
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', args = '', content = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split('\n\n'); // SSE 以空行分段
      buf = chunks.pop() || '';

      for (const part of chunks) {
        if (!part.startsWith('data:')) continue;
        const data = part.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta || {};

          // ① 累积 tool_calls 的 arguments（流式）
          const tc = delta.tool_calls?.[0];
          if (tc?.function?.arguments) {
            args += tc.function.arguments;
            if (statusEl) statusEl.textContent = '已接收 ' + args.length + ' 字符…';
          }

          // ② 同时累积普通 content（部分模型会直接把 JSON 写到 content）
          if (delta.content) {
            content += delta.content;
            if (!args && statusEl) statusEl.textContent = '已接收文本 ' + content.length + ' 字符…';
          }
        } catch (_) {
          // 单条 data 可能并非 JSON，忽略
        }
      }
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '读取流失败。';
    return;
  } finally {
    if ($('progBox')) $('progBox').style.display = 'none';
  }

  // —— 尝试解析：优先 arguments，其次 content —— 
  let plan = tryParseJsonWithBraces(args) || tryParseJsonWithBraces(content);

  if (!plan) {
    if (statusEl) statusEl.textContent = '解析失败，请重试。';
    if (rawEl) rawEl.textContent = (args || content || '(空)');
    return;
  }

  if (rawEl) rawEl.textContent = JSON.stringify(plan, null, 2);
  if (statusEl) statusEl.textContent = '生成完成 ✅';

  // 渲染 & 按钮解锁
  try { renderWidgets(plan); } catch (_) {}
  ['saveBtn','copyBtn','dlJsonBtn','dlHtmlBtn'].forEach(id=>{
    const b=$(id); if(b) b.disabled=false;
  });
}

function tryParseJsonWithBraces (txt) {
  if (!txt) return null;
  // 尝试直接 parse
  try { return JSON.parse(txt); } catch (_) {}
  // 花括号截取兜底
  const s = txt.indexOf('{');
  const e = txt.lastIndexOf('}');
  if (s >= 0 && e >= s) {
    const cut = txt.slice(s, e + 1);
    try { return JSON.parse(cut); } catch (_) {}
  }
  return null;
}

// ===== 示例渲染：你可以改成自己的 DOM 结构 =====
function renderWidgets (plan) {
  // 在页面某个容器里渲染计划（留空也不会报错）
  const box = document.getElementById('resultBox');
  if (!box) return;
  box.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = plan.title || '结果';
  box.appendChild(h);
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(plan, null, 2);
  box.appendChild(pre);
}

// ===== 实用按钮：复制 / 下载 JSON / 下载 HTML =====
function copyRaw () {
  const raw = $('raw')?.textContent || '';
  if (!raw) return;
  navigator.clipboard.writeText(raw).then(()=>{
    toast('已复制到剪贴板');
  });
}

function downloadJSON () {
  const raw = $('raw')?.textContent || '';
  if (!raw) return;
  const blob = new Blob([raw], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plan.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportHTML () {
  const raw = $('raw')?.textContent || '';
  if (!raw) return;
  const plan = tryParseJsonWithBraces(raw) || {};
  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${escapeHtml(plan.title||'导出')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:900px;margin:40px auto;padding:0 16px;line-height:1.6}pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}</style>
</head><body>
<h1>${escapeHtml(plan.title||'导出')}</h1>
<pre>${escapeHtml(JSON.stringify(plan,null,2))}</pre>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plan.html';
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml (s='') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

function toast (msg) {
  if (!msg) return;
  const div = document.createElement('div');
  div.textContent = msg;
  Object.assign(div.style, {
    position:'fixed', left:'50%', top:'20px',
    transform:'translateX(-50%)', background:'#222', color:'#fff',
    padding:'8px 12px', borderRadius:'8px', zIndex:'9999'
  });
  document.body.appendChild(div);
  setTimeout(()=>div.remove(), 1500);
}

// ===== 事件绑定 =====
window.addEventListener('DOMContentLoaded', () => {
  const genBtn = $('genBtn') || document.querySelector('[data-action="generate"]');
  if (genBtn) genBtn.addEventListener('click', (e)=>{ e.preventDefault(); startGeneration(); });
  const copyBtn = $('copyBtn'); if (copyBtn) copyBtn.addEventListener('click', copyRaw);
  const dlJsonBtn = $('dlJsonBtn'); if (dlJsonBtn) dlJsonBtn.addEventListener('click', downloadJSON);
  const dlHtmlBtn = $('dlHtmlBtn'); if (dlHtmlBtn) dlHtmlBtn.addEventListener('click', exportHTML);
});
</script>
