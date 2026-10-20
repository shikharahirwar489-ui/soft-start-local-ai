import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const model = process.env.OLLAMA_MODEL || "gemma3:1b";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8_000) throw new Error("The request is too large.");
  }
  return JSON.parse(body || "{}");
}

function cleanPlan(candidate) {
  const list = Array.isArray(candidate.steps) ? candidate.steps : [];
  const steps = list
    .slice(0, 4)
    .map((item) => String(item).trim().slice(0, 180))
    .filter(Boolean);
  if (!steps.length) throw new Error("The model returned an empty plan.");
  return {
    firstStep: String(candidate.firstStep || steps[0]).trim().slice(0, 180),
    steps,
    finishLine: String(candidate.finishLine || "You can stop after the first step.").trim().slice(0, 180),
    time: [3, 5, 10, 15].includes(Number(candidate.time)) ? Number(candidate.time) : 5,
    note: String(candidate.note || "Small is still progress.").trim().slice(0, 120),
  };
}

async function makePlan(task, energy) {
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.35 },
      messages: [
        {
          role: "system",
          content: "You are Soft Start, a kind and practical task coach. Make a gentle plan that lowers friction, never guilt. Return only JSON with keys firstStep (string), steps (array of 2 to 4 short strings), finishLine (string), time (one of 3, 5, 10, 15), and note (one reassuring sentence). The first step should take at most 2 minutes to begin. Respect the user's energy level. Do not ask for private details.",
        },
        {
          role: "user",
          content: `Task: ${task}\nEnergy today: ${energy}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  const data = await response.json();
  const raw = data.message?.content;
  if (!raw) throw new Error("The local model did not return a plan.");
  return cleanPlan(JSON.parse(raw));
}

async function serveFile(request, response) {
  const requested = new URL(request.url, "http://localhost").pathname;
  const relative = requested === "/" ? "index.html" : decodeURIComponent(requested.slice(1));
  const filename = path.resolve(here, relative);
  if (!filename.startsWith(`${here}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filename);
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filename)] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
    if (request.method === "HEAD") response.end();
    else response.end(content);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/plan") {
    try {
      const body = await readJson(request);
      const task = typeof body.task === "string" ? body.task.trim() : "";
      const energy = ["low", "some", "plenty"].includes(body.energy) ? body.energy : "some";
      if (task.length < 4 || task.length > 400) {
        sendJson(response, 400, { error: "Give the task a few words (up to 400 characters)." });
        return;
      }
      const plan = await makePlan(task, energy);
      sendJson(response, 200, { plan, model, provider: "Ollama · local" });
    } catch (error) {
      const offline = error.cause?.code === "ECONNREFUSED" || error.cause?.code === "ENOTFOUND";
      const timeout = error.name === "TimeoutError";
      sendJson(response, offline || timeout ? 503 : 502, {
        error: offline
          ? `I couldn't reach Ollama on this computer. Start Ollama, then make sure ${model} is available.`
          : timeout
            ? "The local model took too long this time. Try a smaller model or a shorter task."
            : "The local model couldn't shape a plan just now. Try again or use the sample preview.",
        code: offline ? "OLLAMA_OFFLINE" : timeout ? "MODEL_TIMEOUT" : "MODEL_ERROR",
      });
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await serveFile(request, response);
    return;
  }
  response.writeHead(405, { allow: "GET, HEAD, POST" }).end("Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Soft Start is ready at http://127.0.0.1:${port}`);
  console.log(`Local model: ${model}`);
});
