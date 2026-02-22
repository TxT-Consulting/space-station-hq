import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME = path.join(process.env.HOME || "/root", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

export async function POST(req: Request) {
  try {
    const { sessionKey, agentId } = await req.json();
    if (!sessionKey || !agentId) {
      return NextResponse.json({ error: "Missing sessionKey or agentId" }, { status: 400 });
    }

    // Read gateway config
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    const gatewayPort = config.gateway?.port || 18789;
    const gatewayToken = config.gateway?.auth?.token || "";

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gatewayToken}`,
        "x-openclaw-agent-id": agentId,
        "x-openclaw-session-key": sessionKey,
      };

      const resp = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: `openclaw:${agentId}`,
          messages: [{ role: "user", content: "Health check: reply with OK" }],
          max_tokens: 64,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await resp.json();
      const elapsed = Date.now() - startTime;

      if (!resp.ok) {
        return NextResponse.json({
          status: "error",
          sessionKey,
          elapsed,
          error: data.error?.message || JSON.stringify(data),
        });
      }

      const reply = data.choices?.[0]?.message?.content || "";
      return NextResponse.json({
        status: "ok",
        sessionKey,
        elapsed,
        reply: reply.slice(0, 200) || "(no reply)",
      });
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      return NextResponse.json({
        status: "error",
        sessionKey,
        elapsed,
        error: isTimeout ? "Timeout: agent not responding (30s)" : (err.message || "Unknown error").slice(0, 300),
      });
    }
  } catch (err: any) {
    return NextResponse.json({ status: "error", error: err.message }, { status: 500 });
  }
}
