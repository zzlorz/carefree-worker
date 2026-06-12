const SILICONFLOW_API_BASE = "https://api.siliconflow.cn/v1";

const ALLOWED_MODELS = [
  "Qwen/Qwen3-8B",
  "THUDM/GLM-4-9B-0414",
  "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function handleModels() {
  const models = ALLOWED_MODELS.map((id) => ({
    id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "siliconflow",
  }));
  return json({ object: "list", data: models });
}

async function handleChatCompletions(request, env) {
  const apiKey = env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return json({ error: { message: "API key not configured", type: "api_error" } }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400);
  }

  if (!body.model) {
    return json({ error: { message: "model is required", type: "invalid_request_error" } }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: { message: "messages is required and must be non-empty", type: "invalid_request_error" } }, 400);
  }

  const payload = {
    model: body.model,
    messages: body.messages,
    stream: body.stream ?? false,
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_tokens,
    stop: body.stop,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
  };

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  try {
    const apiResponse = await fetch(`${SILICONFLOW_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (body.stream) {
      return new Response(apiResponse.body, {
        status: apiResponse.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders(),
        },
      });
    }

    const data = await apiResponse.json();
    return json(data, apiResponse.status);
  } catch (err) {
    return json({ error: { message: err.message, type: "api_error" } }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const path = url.pathname;

    if (path === "/v1/models" && request.method === "GET") {
      return handleModels();
    }

    if (path === "/v1/chat/completions" && request.method === "POST") {
      return handleChatCompletions(request, env);
    }

    if (path === "/" || path === "/health") {
      return json({ status: "ok", service: "siliconflow-proxy" });
    }

    return json({ error: { message: "Not found", type: "invalid_request_error" } }, 404);
  },
};
