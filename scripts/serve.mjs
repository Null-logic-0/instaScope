import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = decodeURIComponent(url.pathname) + (url.pathname.endsWith("/") ? "index.html" : "");
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep) && file !== root) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end("Not found. Run npm run build first.");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`instaScope workbench: http://localhost:${port}/`);
});
