import { expect, mock, test } from "bun:test";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));
mock.module("../../../src/lib/logger.js", () => ({
	logger: { info() {}, warn() {}, error() {} },
}));

const metadata = [
	{
		name: "attach",
		description: "attach",
		inputSchema: {
			type: "object",
			properties: { request: { type: "object", additionalProperties: true } },
		},
	},
];
const calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];
mock.module("../../../agent/lib/autumnToolMetadata.js", () => ({
	serverToolMetadata: async () => metadata,
	leafMcpBaseUrl: () => "http://localhost",
}));
mock.module("../../../src/internal/autumnMcp/client.js", () => ({
	executeAutumnMcpTool: async ({
		toolName,
		args,
	}: {
		toolName: string;
		args: Record<string, unknown>;
	}) => {
		calls.push({ toolName, args });
		const request = args.request as Record<string, unknown>;
		if (toolName === "previewAttach")
			return {
				customer_id: request.customer_id,
				plan_id: request.plan_id,
				currency: "usd",
				total: 49,
			};
		return { list: [] };
	},
}));

const proposal = {
	status: "proposal",
	message: "",
	unsupported_obligations: [],
	actions: [
		{
			operation: "attach",
			request: {
				customer_id: "atlas",
				plan_id: "pro",
				customize: { price: { amount: 49, interval: "month" } },
			},
		},
	],
};
mock.module("ai", () => ({
	generateText: async () => ({ output: proposal }),
	jsonSchema: (schema: unknown) => schema,
	Output: { object: (input: unknown) => input },
}));
mock.module("../../../../leaf-lab/lib/dynamicContext.js", () => ({
	prepareDynamicContext: async ({
		messages,
		pending,
		completed,
	}: {
		messages: unknown[];
		pending?: unknown[];
		completed?: unknown[];
	}) => ({
		operations: ["attach"],
		selection: {},
		markdown: "ctx",
		evidence: {
			messages,
			pending: pending ?? [],
			completed: completed ?? [],
			today: "2026-09-16T00:00:00.000Z",
			dateAnchors: [],
			dateAnchorMeaning: "",
			facts: {
				listPlans: { list: [{ id: "pro", name: "Pro" }] },
				listCustomers: { list: [{ id: "atlas", name: "Atlas" }] },
				listFeatures: { list: [] },
			},
			details: [],
			reads: [],
		},
	}),
}));
mock.module("../../../../leaf-lab/lib/verifyOperationPlan.js", () => ({
	assertPlanRules: () => ({ status: "semantic_review", reason: "test" }),
	verifyOperationPlan: async () => ({}),
}));

const { runStructuredAgentTurn, structuredAgentEnabled } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/structured/runStructuredAgentTurn.js"
);

const ctx = {
	env: "sandbox",
	id: "t",
	logger: { info() {}, warn() {}, error() {} },
	org: { id: "org" },
	providerUserId: "u",
	thread: {
		channelId: "c",
		provider: "slack",
		threadId: "thread-1",
		workspaceId: "w",
	},
	timestamp: 0,
	token: "tok",
} as unknown as Parameters<typeof runStructuredAgentTurn>[0]["ctx"];

test("the flag is off unless explicitly enabled", () => {
	const original = process.env.LEAF_STRUCTURED_AGENT;
	delete process.env.LEAF_STRUCTURED_AGENT;
	expect(structuredAgentEnabled()).toBe(false);
	process.env.LEAF_STRUCTURED_AGENT = "1";
	expect(structuredAgentEnabled()).toBe(true);
	if (original === undefined) delete process.env.LEAF_STRUCTURED_AGENT;
	else process.env.LEAF_STRUCTURED_AGENT = original;
});

test("a proposal becomes a Leaf approval result with the exact previewed request and no write", async () => {
	const result = await runStructuredAgentTurn({
		ctx,
		params: { text: "Attach Pro to Atlas at $49/month" },
	});
	expect(result.kind).toBe("approval");
	if (result.kind !== "approval") throw new Error("unreachable");
	expect(result.approval.toolName).toBe("attach");
	expect(result.approval.toolArgs.request).toMatchObject(
		proposal.actions[0].request,
	);
	expect(result.approval.toolArgs.request).toEqual(
		calls.find((c) => c.toolName === "previewAttach")?.args.request,
	);
	expect(typeof result.approval.toolArgs.approval_description).toBe("string");
	expect(result.approval.preview).toMatchObject({
		customer_id: "atlas",
		total: 49,
	});
	expect(calls.map((c) => c.toolName)).toEqual(["previewAttach"]);
});

test("the approval outcome advances the same thread's executor without re-proposing", async () => {
	const result = await runStructuredAgentTurn({
		ctx,
		params: {
			text: "1. attach applied",
			clientContext: {
				approvalOutcome: {
					writes: [
						{
							result: { status: "created" },
							status: "applied",
							toolName: "attach",
						},
					],
				},
			},
		},
	});
	expect(result.kind).toBe("reply");
	expect(calls.filter((c) => c.toolName === "attach")).toHaveLength(0);
});
