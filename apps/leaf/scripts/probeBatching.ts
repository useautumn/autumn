/**
 * Does the model emit several writes in ONE assistant message?
 *
 * Talks to the model directly with the real Leaf system prompt and the real MCP
 * write schemas — no MCP server, no eval harness. Answers only the batching
 * question, which is the one thing Slack testing cannot isolate.
 *
 *   ENV_FILE=.env infisical run --env=dev --recursive -- \
 *     bun apps/leaf/scripts/probeBatching.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { leafSystemPrompt } from "@autumn/agent-docs/agent";

const MODEL = process.env.PROBE_MODEL ?? "claude-sonnet-4-5";
const RUNS_PER_SCENARIO = Number(process.env.PROBE_RUNS ?? 5);

const WRITE_TOOLS = ["attach", "updateCustomer", "updateSubscription"] as const;
const READ_TOOLS = ["listCustomers", "listPlans", "previewAttach"] as const;

// Shapes only — the question is how MANY writes land in one message, not
// whether their bodies validate.
const requestProperties: Record<string, Record<string, unknown>> = {
	attach: {
		customer_id: { type: "string" },
		plan_id: { type: "string" },
	},
	updateCustomer: {
		customer_id: { type: "string" },
		email: { type: "string" },
	},
	updateSubscription: {
		customer_id: { type: "string" },
		plan_id: { type: "string" },
	},
	previewAttach: {
		customer_id: { type: "string" },
		plan_id: { type: "string" },
	},
	listCustomers: {},
	listPlans: {},
};

const tools = [...WRITE_TOOLS, ...READ_TOOLS].map((name) => ({
	name,
	description: `Autumn ${name}.`,
	input_schema: {
		type: "object" as const,
		properties: {
			request: {
				type: "object",
				properties: requestProperties[name] ?? {},
			},
		},
		required: ["request"],
	},
}));

const CONTEXT = `Customers: Acme Labs (id cus_acme, email old@acme.example), Beacon (id cus_beacon).
Plans: Scale (id scale), Launch (id launch).
Acme Labs is on no plan. Beacon is on no plan.`;

const scenarios = [
	{
		name: "dependent, 'and then'",
		message:
			"Update Acme Labs' email to finance@acme.example and then attach the Scale plan.",
	},
	{
		name: "dependent, plain 'and'",
		message:
			"Update Acme Labs' email to finance@acme.example and attach the Scale plan.",
	},
	{
		name: "independent fan-out",
		message: "Attach the Scale plan to both Acme Labs and Beacon.",
	},
];

const client = new Anthropic();

type Turn = { role: "assistant" | "user"; content: unknown };

/** The prompt requires a preview first, so the writes land a turn later — run
 * the loop until writes appear and report the batch they arrived in. */
const writesInOneMessage = async (message: string) => {
	const messages: Turn[] = [{ role: "user", content: message }];
	for (let step = 0; step < 4; step += 1) {
		const response = await client.messages.create({
			model: MODEL,
			max_tokens: 2048,
			system: `${leafSystemPrompt("slack")}\n\nKnown state (no lookups needed):\n${CONTEXT}`,
			tools,
			messages: messages as never,
		});
		const toolUses = response.content.filter(
			(block) => block.type === "tool_use",
		);
		const writes = toolUses.flatMap((block) =>
			block.type === "tool_use" &&
			(WRITE_TOOLS as readonly string[]).includes(block.name)
				? [block.name]
				: [],
		);
		if (writes.length) return writes;
		if (!toolUses.length) return [];
		messages.push({ role: "assistant", content: response.content });
		messages.push({
			role: "user",
			content: toolUses.map((block) => ({
				type: "tool_result",
				tool_use_id: (block as { id: string }).id,
				content: '{"ok":true,"total":100,"currency":"usd"}',
			})),
		});
	}
	return [];
};

for (const scenario of scenarios) {
	const results = await Promise.all(
		Array.from({ length: RUNS_PER_SCENARIO }, () =>
			writesInOneMessage(scenario.message),
		),
	);
	const batched = results.filter((writes) => writes.length > 1).length;
	console.log(
		`${batched}/${RUNS_PER_SCENARIO} batched | ${scenario.name} | ${JSON.stringify(results)}`,
	);
}
