import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 60,
};

const TARGET_BASE = (process.env.MEOW || "").replace(/\/$/, "");

const FORBIDDEN_HEADERS = [
  "host", "connection", "keep-alive", "proxy-authenticate", 
  "proxy-authorization", "te", "trailer", "transfer-encoding", 
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto", 
  "x-forwarded-port"
];

export default async function handler(req, res) {
  if (!TARGET_BASE) {
    res.status(500).send("Misconfigured: MEOW is not set");
    return;
  }

  try {
    const targetUrl = `${TARGET_BASE}${req.url}`;
    const outgoingHeaders = {};

    Object.entries(req.headers).forEach(([key, value]) => {
      const k = key.toLowerCase();
      if (FORBIDDEN_HEADERS.includes(k) || k.startsWith("x-vercel-")) return;
      
      if (k === "x-real-ip" || k === "x-forwarded-for") {
        outgoingHeaders["x-forwarded-for"] = Array.isArray(value) ? value[0] : value;
        return;
      }

      outgoingHeaders[k] = Array.isArray(value) ? value.join(", ") : value;
    });

    const isPostOrPut = !["GET", "HEAD"].includes(req.method);
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: outgoingHeaders,
      redirect: "manual",
      ...(isPostOrPut && { 
        body: Readable.toWeb(req), 
        duplex: "half" 
      }),
    });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "transfer-encoding") {
        try { res.setHeader(key, value); } catch (e) {}
      }
    });

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), res);
    } else {
      res.end();
    }
  } catch (error) {
  }
}
