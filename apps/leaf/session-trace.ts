import Anthropic from "@anthropic-ai/sdk";

const sessionId = process.argv[2];
if (!sessionId) throw new Error("usage: bun session-trace.ts <sessionId>");
const client = new Anthropic();

const events: any[] = [];
for await (const event of client.beta.sessions.events.list(sessionId)) {
	events.push(event);
}

let prev: number | null = null;
for (const e of events) {
	const ts = e.processed_at ? Date.parse(e.processed_at) : null;
	const gap = ts && prev ? `+${((ts - prev) / 1000).toFixed(1)}s` : "";
	prev = ts ?? prev;
	const time = ts ? new Date(ts).toISOString().slice(11, 23) : "??";
	let detail = "";
	if (e.type === "agent.mcp_tool_use") detail = `${e.tool_name ?? e.name} ${JSON.stringify(e.input ?? {}).slice(0, 120)}`;
	else if (e.type === "agent.mcp_tool_result") detail = `${e.tool_name ?? ""} ${JSON.stringify(e.content ?? e.result ?? {}).slice(0, 120)}`;
	else if (e.type === "agent.message") detail = JSON.stringify(e.content ?? e.text ?? "").slice(0, 150);
	else if (e.type?.startsWith("span.")) detail = JSON.stringify({ name: e.name, model: e.model, usage: e.usage }).slice(0, 150);
	else if (e.type === "user.message") detail = JSON.stringify(e.content ?? "").slice(0, 100);
	else detail = JSON.stringify(e).slice(0, 120);
	console.log(`${time} ${gap.padStart(8)} ${e.type}  ${detail}`);
}
console.log(`\ntotal events: ${events.length}`);
