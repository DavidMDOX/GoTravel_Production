export const config = { runtime: "edge" };
export default async function handler(req) {
  if (req.method !== "POST") return new Response(JSON.stringify({ error:"Method Not Allowed" }), { status:405 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error:"Missing OPENAI_API_KEY" }), { status:500 });
  const body = await req.json();
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
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true, tools, tool_choice: { type: "function", function: { name: "return_plan" } } })
  });
  return new Response(r.body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" } });
}
