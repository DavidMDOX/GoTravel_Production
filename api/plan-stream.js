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

    const sysExtra = {
      role: "system",
      content: [
        "你是资深旅行规划师。务必生成**细致可执行**的行程：",
        "1) 概览里给出简明摘要与预算区间（货币符号）。",
        "2) 每日安排包含：交通方式、时间建议、就餐建议（午/晚餐）、以及至少3个 POI。",
        "3) 每个 POI 必须尽量包含：name, type, address（含邮编或区域信息）, url（官网或权威页面，如没有可省略）, ticket（门票/费用，若免费写“免费”或“0”）, time_suggest（建议停留时长，如“1–1.5h”）, tips（排队/拍照/闭馆日等建议）。",
        "4) 所有输出仅通过函数参数返回，禁止额外解释文本。"
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
                  morning: { type: "array", items: { type: "string" } },
                  afternoon: { type: "array", items: { type: "string" } },
                  evening: { type: "array", items: { type: "string" } },
                  transport: { type: "string" },
                  dining: { type: "object", properties: {
                    lunch: { type: "string" }, dinner: { type: "string" }
                  }},
                  timeline: { type: "array", items: { type: "string" } },
                  budget: { type: "object", properties: { currency:{type:"string"}, min:{type:"number"}, max:{type:"number"} } },
                  notes: { type: "array", items: { type: "string" } },
                  pois: { type: "array", items: {
                    type: "object",
                    properties: {
                      name:{type:"string"},
                      type:{type:"string"},
                      address:{type:"string"},
                      url:{type:"string"},
                      ticket:{type:"string"},
                      time_suggest:{type:"string"},
                      tips:{type:"string"}
                    },
                    required:["name","type","address"]
                  } }
                },
                required: ["title","pois"]
              }
            },
            links: { type: "object", properties: { official_sites: { type: "array", items: { type: "string" } } } }
          },
          required: ["overview","days"]
        }
      }
    }];

    // 把额外系统约束插在最前
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
