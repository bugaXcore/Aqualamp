import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const maxReportBytes = 512 * 1024;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/ble.js", ["ble.js", "text/javascript; charset=utf-8"]],
  ["/log.js", ["log.js", "text/javascript; charset=utf-8"]],
  ["/protocol.js", ["protocol.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function normalizeReport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || !Array.isArray(input.services) || input.services.length > 100) {
    throw new Error("Report must contain a services array.");
  }

  const services = input.services.map((service) => {
    if (!service || typeof service.uuid !== "string" || !Array.isArray(service.characteristics)) {
      throw new Error("Report contains an invalid service.");
    }
    return {
      uuid: service.uuid,
      name: typeof service.name === "string" ? service.name : service.uuid,
      characteristics: service.characteristics.map((characteristic) => {
        if (!characteristic || typeof characteristic.uuid !== "string"
          || !Array.isArray(characteristic.properties) || !Array.isArray(characteristic.descriptors)) {
          throw new Error("Report contains an invalid characteristic.");
        }
        return {
          uuid: characteristic.uuid,
          name: typeof characteristic.name === "string" ? characteristic.name : characteristic.uuid,
          properties: characteristic.properties.filter((property) => typeof property === "string"),
          descriptors: characteristic.descriptors
            .filter((descriptor) => descriptor && typeof descriptor.uuid === "string")
            .map((descriptor) => ({
              uuid: descriptor.uuid,
              name: typeof descriptor.name === "string" ? descriptor.name : descriptor.uuid,
            })),
          ...(typeof characteristic.descriptorError === "string"
            ? { descriptorError: characteristic.descriptorError }
            : {}),
        };
      }),
    };
  });

  return {
    exportedAt: typeof input.exportedAt === "string" ? input.exportedAt : new Date().toISOString(),
    device: { name: typeof input.device?.name === "string" ? input.device.name : null },
    services,
    ...(Array.isArray(input.traffic) ? {
      traffic: input.traffic.slice(-2000)
        .filter((entry) => entry && typeof entry.time === "string"
          && typeof entry.kind === "string" && typeof entry.message === "string")
        .map((entry) => {
          let message = entry.message.slice(0, 4000);
          if (entry.kind === "EVT" && message.startsWith("Selected ")) {
            message = message.replace(/\s+\([^)]*\)\.$/, ".");
          }
          return {
            time: entry.time,
            kind: entry.kind,
            message,
            ...(typeof entry.uuid === "string" ? { uuid: entry.uuid } : {}),
          };
        }),
    } : {}),
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxReportBytes) throw new Error("Report is larger than the 512 KB limit.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function receiveReport(request, response, reportDirectory) {
  if (!isLoopback(request.socket.remoteAddress)) {
    jsonResponse(response, 403, { error: "Reports are accepted only from this PC." });
    return;
  }

  const host = request.headers.host || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    jsonResponse(response, 403, { error: "Use the local page address to send reports." });
    return;
  }
  const origin = request.headers.origin;
  if (origin && origin !== `http://${host}`) {
    jsonResponse(response, 403, { error: "Cross-origin report requests are not accepted." });
    return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
    jsonResponse(response, 415, { error: "Send the report as application/json." });
    return;
  }

  try {
    const report = normalizeReport(await readJsonBody(request));
    await mkdir(reportDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(16).slice(2, 8);
    const filename = `aqualamp-gatt-${stamp}-${suffix}.json`;
    await writeFile(path.join(reportDirectory, filename), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    jsonResponse(response, 201, { saved: true, file: `reports/${filename}` });
  } catch (error) {
    const status = error instanceof SyntaxError || /Report|Request body/.test(error.message) ? 400 : 500;
    console.error(`Report receive failed: ${error.message || error}`);
    jsonResponse(response, status, { error: error.message || "Could not save report." });
  }
}

export function createServer({ reportDirectory = path.join(root, "reports") } = {}) {
  return createHttpServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/api/health") {
      jsonResponse(response, 200, { ready: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/report") {
      void receiveReport(request, response, reportDirectory);
      return;
    }

    const asset = staticFiles.get(url.pathname);
    if ((request.method === "GET" || request.method === "HEAD") && asset) {
      void readFile(path.join(root, asset[0])).then((content) => {
        response.writeHead(200, {
          "Content-Type": asset[1],
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : content);
      }).catch((error) => {
        console.error(`Static file read failed: ${error.message || error}`);
        jsonResponse(response, 500, { error: "Could not read the app file." });
      });
      return;
    }
    jsonResponse(response, 404, { error: "Not found." });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8765);
  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Aqualamp bench available at http://localhost:${port}`);
    console.log("Report receiver is local to this PC; press Ctrl+C to stop.");
  });
}
