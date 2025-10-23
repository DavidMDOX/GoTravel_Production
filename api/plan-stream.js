export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error:"Method Not Allowed" }), { status:405 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error:"Missing OPENAI_API_KEY" }), { status:500 });
  }

  try{
    const body = await req.json();
    const { model, temperature = 0.4, messages = [] } = body || {};

    const tools = [{
      type: "function",
      function: {
        name: "return_plan",
        description: "返回行程 JSON。必须调用这个函数，并仅用其参数表达结果。",
        parameters: {
          type: "object",
          properties: {
            overview: {
              type: "object",
              properties: {
                summary: { type: "string" },
                budget: {
                  type: "object",
                  properties: {
                    currency: { type: "string" },
                    trip_total: { type: "object", properties: { min: {type:"number"}, max:{type:"number"} } },
                    accommodation_per_night: { type: "object", properties: { min: {type:"number"}, max:{type:"number"} } },
                    food_per_day: { type: "object", properties: { min: {type:"number"}, max:{type:"number"} } },
                    transport_total: { type: "object", properties: { min: {type:"number"}, max:{type:"number"} } },
                    activities_total: { type: "object", properties: { min: {type:"number"}, max:{type:"number"} } }
                  },
                  required: ["currency"]
                }
              },
              required: ["summary","budget"]
            },
            days: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  morning: { type: "array", items: { type: "string" } },
                  afternoon: { type: "array", items: { type: "string" } },
                  evening: { type: "array", items: { type: "string" } },
                  transport: { type: "string" },
                  budget: { type: "object", properties: { currency:{type:"string"}, min:{type:"number"}, max:{type:"number"} } },
                  notes: { type: "array", items: { type: "string" } },
                  pois: { type: "array", items: { type: "object", properties: {
                    name:{type:"string"}, type:{type:"string"}, address:{type:"string"}
                  } } }
                },
                required: ["title"]
              }
            },
            links: { type: "object", properties: { official_sites: { type: "array", items: { type: "string" } } } }
          },
          required: ["overview","days"]
        }
      }
    }];

    // 非流式一次性请求，避免前端拼接分片造成 JSON 破损
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature,
        messages,
        tools,
        tool_choice: { type: "function", function: { name: "return_plan" } },
        stream: false
      })
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(()=>r.statusText);
      return new Response(JSON.stringify({ error:"Upstream error", detail: errTxt }), { status:502 });
    }

    const data = await r.json();
    const toolCalls = data?.choices?.[0]?.message?.tool_calls;
    const argStr = toolCalls?.[0]?.function?.arguments || "";
    let plan;
    try{
      plan = JSON.parse(argStr);
    }catch{
      // 兜底：截取大括号范围
      const s = argStr.indexOf("{");
      const e = argStr.lastIndexOf("}");
      if (s>=0 && e>=s) plan = JSON.parse(argStr.slice(s, e+1));
    }
    if (!plan || typeof plan !== "object") {
      return new Response(JSON.stringify({ error:"Bad tool arguments", raw: argStr }), { status:500 });
    }
    return new Response(JSON.stringify(plan), {
      status:200,
      headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
    });

  }catch(err){
    return new Response(JSON.stringify({ error: "Server exception", detail: String(err) }), { status:500 });
  }
}
