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

    // 参考并借用你提供的方案：严格 schema & 前端生成地图锚文本的做法（见 app.py）:contentReference[oaicite:1]{index=1}
    const sysExtra = {
      role: "system",
      content: [
        "你是资深旅行规划师，输出必须细致、可执行，并严格通过函数参数 JSON 返回（禁止额外解释）。",
        "要求：",
        "1) 概览：简明摘要 + 预算区间（含货币符号）。",
        "2) 每日：提供 `timeline`（整体时间安排，2–6 条，形如“08:30–10:00 伦敦塔 | 步行 12 分钟到下一站”）。",
        "3) 每日至少 3 个 POI；每个 POI 必须包含：name, type, address, intro（一句话介绍）。有官网时填 `url`。",
        "4) 细节：为 POI 给 `ticket`（若免费写“免费”/“0”）、`time_suggest`（如“1–1.5h”）、`tips`（预约/闭馆/避坑）。",
        "5) 地址请尽量含城市/区域/邮编或地标，便于地图检索；不要返回地图短链，地图链接交由前端基于 name+address 生成。",
        "6) 交通/就餐建议合理，避免时间冲突；未知信息用“待确认”。"
      ].join("\n")
    };

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
                  timeline: { type: "array", items: { type: "string" } }, // 整体时间安排（新增/强化）
                  morning: { type: "array", items: { type: "string" } },
                  afternoon: { type: "array", items: { type: "string" } },
                  evening: { type: "array", items: { type: "string" } },
                  transport: { type: "string" },
                  dining: { type: "object", properties: { lunch: { type: "string" }, dinner: { type: "string" } } },
                  budget: { type: "object", properties: { currency:{type:"string"}, min:{type:"number"}, max:{type:"number"} } },
                  notes: { type: "array", items: { type: "string" } },
                  pois: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name:{type:"string"},
                        type:{type:"string"},
                        address:{type:"string"},
                        intro:{type:"string"},        // 一句话介绍（新增，必填）
                        url:{type:"string"},
                        ticket:{type:"string"},
                        time_suggest:{type:"string"},
                        tips:{type:"string"}
                      },
                      required:["name","type","address","intro"]
                    }
                  }
                },
                required: ["title","timeline","pois"]
              }
            },
            links: { type: "object", properties: { official_sites: { type: "array", items: { type: "string" } } } }
          },
          required: ["overview","days"]
        }
      }
    }];

    const msgs = [sysExtra, ...messages];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: msgs,
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
