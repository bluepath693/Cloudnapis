// النطاق الرسمي الصحيح بدون www لمنع التحويلات
const UPSTREAM_URL = "https://cleanapis.com/v1/chat/completions";
const ROTATABLE_STATUSES = new Set();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim());
  const headers = { "Vary": "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return headers;
}

export default async (request, context) => {
  const env = {
    ALLOWED_ORIGINS: Netlify.env.get("ALLOWED_ORIGINS"),
    PROXY_TOKEN: Netlify.env.get("PROXY_TOKEN"),
    CLEANAPIS_KEY_1: Netlify.env.get("CLEANAPIS_KEY_1"),
    CLEANAPIS_KEY_2: Netlify.env.get("CLEANAPIS_KEY_2"),
    CLEANAPIS_KEY_3: Netlify.env.get("CLEANAPIS_KEY_3"),
  };

  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  
  // قبول العمل على المسار الرئيسي أو المسار الكامل للتأكد من اشتغال الدالة
  const url = new URL(request.url);
  if (url.pathname !== "/v1/chat/completions" && url.pathname !== "/") {
    return json({ error: "Not found" }, 404, cors);
  }
  
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const auth = request.headers.get("Authorization") || "";
  if (!env.PROXY_TOKEN || auth !== `Bearer ${env.PROXY_TOKEN}`) {
    return json({ error: "Unauthorized" }, 401, cors);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400, cors);
  }

  const keys = [env.CLEANAPIS_KEY_1, env.CLEANAPIS_KEY_2, env.CLEANAPIS_KEY_3]
    .filter((key, index, list) => typeof key === "string" && key.length > 0 && list.indexOf(key) === index);
  if (keys.length === 0) return json({ error: "No upstream API keys are configured" }, 503, cors);

  let lastResponse;
  for (const key of keys) {
    try {
      lastResponse = await fetch(UPSTREAM_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return json({ error: "Could not reach the upstream API" }, 502, cors);
    }
    if (!ROTATABLE_STATUSES.has(lastResponse.status)) {
      return new Response(lastResponse.body, {
        status: lastResponse.status,
        statusText: lastResponse.statusText,
        headers: {
          "content-type": lastResponse.headers.get("content-type") || "application/json",
          ...cors,
        },
      });
    }
  }

  return new Response(lastResponse.body, {
    status: lastResponse.status,
    statusText: lastResponse.statusText,
    headers: {
      "content-type": lastResponse.headers.get("content-type") || "application/json",
      "x-key-pool-exhausted": "true",
      ...cors,
    },
  });
};

// إجبار المنصة على تشغيل الدالة في المسارين معاً
export const config = {
  path: ["/", "/v1/chat/completions"]
};
