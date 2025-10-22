export const config = { runtime: "edge" };
export default async function handler(req) {
  if (req.method !== "POST") return new Response(JSON.stringify({ error:"Method Not Allowed" }), { status:405 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error:"Missing OPENAI_API_KEY" }), { status:500 });
  const body = await req.json();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body: JSON.stringify({ ...body, stream:true, response_format: { type: "json_object" } })
  });
  return new Response(r.body, { headers:{
    "Content-Type":"text/event-stream; charset=utf-8",
    "Cache-Control":"no-cache, no-transform",
    "Connection":"keep-alive",
    "Access-Control-Allow-Origin":"*"
  }});
}