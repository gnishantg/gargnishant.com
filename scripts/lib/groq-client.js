const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function strictSchema(value) {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = strictSchema(child);
  if (result.type === "object" || result.properties) result.additionalProperties = false;
  return result;
}

function extractJson(text) {
  const value = String(text || "").trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : value;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Groq returned invalid JSON");
  }
}

async function completeJson({ model, system, user, maxTokens = 4096, attempts = 2, schema }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_completion_tokens: maxTokens,
          reasoning_effort: "low",
          response_format: schema
            ? { type: "json_schema", json_schema: { name: "bot_output", strict: true, schema: strictSchema(schema) } }
            : { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        }),
        signal: AbortSignal.timeout(60000)
      });

      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(`Groq API ${response.status}: ${payload?.error?.message || response.statusText}`);
        const retryAfter = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
        throw error;
      }
      return { data: extractJson(payload?.choices?.[0]?.message?.content), usage: payload.usage || {} };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(1500 * attempt, error.retryAfterMs || 0)));
      }
    }
  }
  throw lastError;
}

module.exports = { completeJson, extractJson };