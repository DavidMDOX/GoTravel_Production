// plan-stream.js
export const config = { runtime: 'edge' };

// 可按需调整模型
const DEFAULT_MODEL = 'gpt-4.1-mini'; // 或 'gpt-4o-mini' / 你当前可用的模型

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); } catch (_) { body = {}; }
  const userPrompt = (body?.prompt || '').toString();

  // 定义一个“工具函数”的 schema（可让模型走 tool_calls）
  const tools = [
    {
      type: 'function',
      function: {
        name: 'build_plan',
        description: '将用户需求组织为可执行的计划对象（严格 JSON）。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '标题' },
            summary: { type: 'string', description: '简述' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  task: { type: 'string' },
                  detail: { type: 'string' },
                  done: { type: 'boolean' }
                },
                required: ['id', 'task']
              }
            },
            metadata: {
              type: 'object',
              additionalProperties: true
            }
          },
          required: ['title', 'steps'],
          additionalProperties: false
        }
      }
    }
  ];

  // 提示词：引导严格 JSON（不含注释/代码块）
  const systemPrompt = `你是结构化计划生成器。
- 产出必须是严格 JSON，不要包含解释、注释、Markdown 或代码块标记。
- 字段：title, summary, steps[], metadata。
- steps[].done 为布尔值，默认 false。`;

  // 同时启用 response_format 强化 JSON 严格性；即便不触发 tool_calls，content 也将是 JSON。
  const payload = {
    model: body?.model || DEFAULT_MODEL,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    tools,
    // 不强制 tool_choice，前端已做双通道解析；如需强制可改为 { type: "function", function: { name: "build_plan" } }
    response_format: { type: 'json_object' },
    temperature: 0.2
  };

  const openaiUrl = 'https://api.openai.com/v1/chat/completions';
  const upstream = await fetch(openaiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  // 直接把 OpenAI 的 SSE 透传给前端
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      // 保持 SSE 头
      'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      // 允许浏览器读取
      'Access-Control-Allow-Origin': '*'
    }
  });
}
