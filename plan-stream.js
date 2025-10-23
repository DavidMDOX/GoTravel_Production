// plan-stream.js —— Vercel Edge 运行时
export const config = { runtime: 'edge' };

const DEFAULT_MODEL = 'gpt-4.1-mini'; // 可按需替换

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
            metadata: { type: 'object', additionalProperties: true }
          },
          required: ['title', 'steps'],
          additionalProperties: false
        }
      }
    }
  ];

  const systemPrompt = `你是结构化计划生成器。
- 产出必须是严格 JSON，不要包含解释、注释、Markdown 或代码块标记。
- 字段：title, summary, steps[], metadata。
- steps[].done 为布尔值，默认 false。`;

  const payload = {
    model: body?.model || DEFAULT_MODEL,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    tools,
    response_format: { type: 'json_object' },
    temperature: 0.2
  };

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
