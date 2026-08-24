import { Agent } from "@mastra/core/agent";
const agent = new Agent({
	id: "t", name: "t", description: "t",
	instructions: "Reply tersely.",
	model: "openrouter/moonshotai/kimi-k2.5",
});
const start = Date.now();
try {
	const res = await agent.generate("Reply with exactly: ok");
	console.log("text:", res.text?.trim(), "|", Date.now() - start, "ms");
} catch (e) {
	console.log("ERR:", (e as Error).message.slice(0, 300));
}
