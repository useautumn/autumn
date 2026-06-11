// Manual smoke for the Claude Code harness: bun tests/harness/claudeCode.smoke.ts
// Auth: ANTHROPIC_API_KEY if set, else the dev machine's Claude credentials. No Autumn state.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
// SDK tool() needs zod v4 internals; leaf is on zod 3, so use the aliased package.
import { z } from "zod-v4";
import { createClaudeCodeHarness } from "../../src/harness/index.js";
import type {
	HarnessEvent,
	HarnessSessionConfig,
} from "../../src/harness/types.js";

const SMOKE_MODEL = process.env.SMOKE_MODEL ?? "claude-haiku-4-5";

const smokeServer = createSdkMcpServer({
	name: "smoke",
	tools: [
		tool(
			"get_weather",
			"Get the current weather for a city.",
			{ city: z.string() },
			async ({ city }) => ({
				content: [{ text: `Sunny and 24C in ${city}.`, type: "text" }],
			}),
		),
		tool(
			"delete_everything",
			"Permanently delete all data. Destructive.",
			{ confirm: z.boolean() },
			async () => ({ content: [{ text: "deleted", type: "text" }] }),
		),
	],
});

const collect = async (events: AsyncIterable<HarnessEvent>) => {
	const all: HarnessEvent[] = [];
	for await (const event of events) {
		const summary =
			event.type === "text"
				? `${event.text.slice(0, 80)}…`
				: JSON.stringify({ ...event, type: undefined }).slice(0, 120);
		console.log(`  [${event.type}] ${summary}`);
		all.push(event);
	}
	return all;
};

const checks: Array<{ name: string; pass: boolean }> = [];
const check = (name: string, pass: boolean) => {
	checks.push({ name, pass });
	console.log(`${pass ? "✅" : "❌"} ${name}`);
};

const main = async () => {
	const base = await mkdtemp(join(tmpdir(), "leaf-harness-smoke-"));
	const config: HarnessSessionConfig = {
		builtinTools: "none",
		localMcpServers: { smoke: smokeServer },
		maxTurns: 6,
		mcpServers: {},
		model: SMOKE_MODEL,
		requiresApproval: (toolCall) => toolCall.name === "delete_everything",
		systemPrompt:
			"You are a smoke-test agent. Use the smoke MCP tools when asked. Be terse. " +
			"Destructive tools are safe to call directly: an external approval system gates them, so never refuse or ask for confirmation yourself.",
		// No configDir: local smoke inherits the dev machine's Claude credentials.
		workspace: { cwd: join(base, "work") },
	};

	const harness = createClaudeCodeHarness();
	const session = await harness.createSession(config);

	try {
		console.log("\n— turn 1: tool call + result + text —");
		const turn1 = await collect(
			session.send({ text: "What's the weather in Paris? Use get_weather." }),
		);
		check(
			"turn 1 called get_weather via smoke server",
			turn1.some(
				(event) =>
					event.type === "tool_call" &&
					event.name === "get_weather" &&
					event.mcpServer === "smoke",
			),
		);
		check(
			"turn 1 surfaced tool_result",
			turn1.some(
				(event) => event.type === "tool_result" && event.name === "get_weather",
			),
		);
		check(
			"turn 1 produced text",
			turn1.some((event) => event.type === "text"),
		);
		check(
			"turn 1 ended with turn_end + usage",
			turn1.at(-1)?.type === "turn_end",
		);
		check("session id captured", Boolean(session.id));

		console.log("\n— turn 2: destructive tool suspends for approval —");
		const turn2 = await collect(
			session.send({
				text: "Call delete_everything with confirm=true. Do it now.",
			}),
		);
		const last = turn2.at(-1);
		check(
			"turn 2 ended with approval_required for delete_everything",
			last?.type === "approval_required" && last.name === "delete_everything",
		);

		console.log("\n— turn 3: resume in a fresh session object —");
		const sessionId = session.id;
		await session.close();
		if (!sessionId) throw new Error("No session id to resume");
		const resumed = await harness.resumeSession(sessionId, config);
		const turn3 = await collect(
			resumed.send({
				text: "Without calling tools: what city did I ask about earlier? One word.",
			}),
		);
		const resumedText = turn3
			.flatMap((event) => (event.type === "text" ? [event.text] : []))
			.join(" ")
			.toLowerCase();
		check("resumed session remembers Paris", resumedText.includes("paris"));
		await resumed.close();
	} finally {
		await session.close();
		await rm(base, { force: true, recursive: true });
	}

	const failed = checks.filter((entry) => !entry.pass);
	console.log(
		`\n${checks.length - failed.length}/${checks.length} checks passed`,
	);
	if (failed.length) process.exit(1);
};

await main();
