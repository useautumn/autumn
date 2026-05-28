import { describe, expect, mock, test } from "bun:test";
import type { AutumnMcpAuth } from "./auth.js";
import { createTestRedis } from "./test-redis.js";

const systemPrompts: string[] = [];
let agentConfirms = true;
let agentCalls = 0;

mock.module("@mastra/core/agent", () => ({
	Agent: class {
		private readonly tools: Record<string, { execute?: Function }>;

		constructor(config: { tools: Record<string, { execute?: Function }> }) {
			this.tools = config.tools;
		}

		async generate(
			message: string,
			options: {
				requestContext: unknown;
				context: { content: string }[];
			},
		) {
			agentCalls += 1;
			const systemPrompt = options.context[0]?.content ?? "";
			systemPrompts.push(systemPrompt);
			const context = { requestContext: options.requestContext };
			if (message.toLowerCase().includes("customers")) {
				const result = await this.tools.listCustomers.execute?.(
					{ request: {} },
					context,
				);
				return { text: JSON.stringify(result) };
			}

			if (agentConfirms && systemPrompt.includes("Pending billing action")) {
				const result = await this.tools.confirmBillingAction.execute?.(
					{},
					context,
				);
				return { text: JSON.stringify(result) };
			}
			if (systemPrompt.includes("Pending billing action")) {
				return { text: "There is no pending billing action to confirm." };
			}

			const result = await this.tools.previewAttach.execute?.(
				{ request: { customer_id: "cus_1", plan_id: "pro" } },
				context,
			);
			return { text: JSON.stringify(result) };
		}
	},
}));

const { createAskAutumnTool } = await import("./ask-autumn.js");
const { setPendingActionsRedis } = await import("./pending-actions.js");

const auth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["billing:read", "billing:write"],
	serverURL: "http://localhost:8080",
};

const mockFetch = (calls: { url: string; body: unknown }[]) => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (url, init) => {
		const body = JSON.parse(init?.body as string);
		calls.push({ url: String(url), body });

		if (String(url).endsWith("/v1/billing.preview_attach")) {
			return Response.json({ total: 50 });
		}

		if (String(url).endsWith("/v1/billing.attach")) {
			return Response.json({ applied: true });
		}

		if (String(url).endsWith("/v1/customers.list")) {
			return Response.json({ customers: [] });
		}

		return Response.json({ error: "unexpected" }, { status: 500 });
	}) as typeof fetch;
	return () => {
		globalThis.fetch = originalFetch;
	};
};

describe("ask_autumn billing confirmation flow", () => {
	test("confirms a pending attach across separate ask_autumn calls", async () => {
		setPendingActionsRedis(createTestRedis());
		systemPrompts.length = 0;
		agentConfirms = true;
		agentCalls = 0;
		const calls: { url: string; body: unknown }[] = [];
		const restoreFetch = mockFetch(calls);

		try {
			const tool = createAskAutumnTool();
			if (!tool.execute) throw new Error("ask_autumn is not executable");
			const context = { mcp: { extra: { authInfo: auth } } } as never;

			const preview = await tool.execute(
				{ message: "attach pro to cus_1" },
				context,
			);
			expect(String(preview)).toContain("Preview ready");
			expect(systemPrompts.at(-1)).not.toContain("Pending billing action");
			expect(calls.map((call) => call.url)).toEqual([
				"http://localhost:8080/v1/billing.preview_attach",
			]);

			const confirm = await tool.execute({ message: "confirm" }, context);
			expect(String(confirm)).toContain("Confirmed and applied attach.");
			expect(calls).toEqual([
				{
					url: "http://localhost:8080/v1/billing.preview_attach",
					body: {
						customer_id: "cus_1",
						plan_id: "pro",
						redirect_mode: "if_required",
					},
				},
				{
					url: "http://localhost:8080/v1/billing.attach",
					body: {
						customer_id: "cus_1",
						plan_id: "pro",
						redirect_mode: "if_required",
					},
				},
			]);
		} finally {
			restoreFetch();
		}
	});

	test("semantic confirmation gets the pending preview context", async () => {
		setPendingActionsRedis(createTestRedis());
		systemPrompts.length = 0;
		agentConfirms = true;
		agentCalls = 0;
		const calls: { url: string; body: unknown }[] = [];
		const restoreFetch = mockFetch(calls);

		try {
			const tool = createAskAutumnTool();
			if (!tool.execute) throw new Error("ask_autumn is not executable");
			const context = { mcp: { extra: { authInfo: auth } } } as never;

			await tool.execute({ message: "attach pro to cus_1" }, context);
			expect(agentCalls).toBe(1);

			const confirm = await tool.execute(
				{ message: "that looks good, go ahead" },
				context,
			);
			expect(String(confirm)).toContain("Confirmed and applied attach.");
			expect(agentCalls).toBe(2);
			expect(systemPrompts.at(-1)).toContain("Pending billing action:");
			expect(systemPrompts.at(-1)).toContain("Preview:");
			expect(systemPrompts.at(-1)).toContain('"total":50');
			expect(calls.map((call) => call.url)).toEqual([
				"http://localhost:8080/v1/billing.preview_attach",
				"http://localhost:8080/v1/billing.attach",
			]);
		} finally {
			restoreFetch();
		}
	});

	test("question-like confirmation text does not bypass the agent", async () => {
		setPendingActionsRedis(createTestRedis());
		systemPrompts.length = 0;
		agentConfirms = false;
		agentCalls = 0;
		const calls: { url: string; body: unknown }[] = [];
		const restoreFetch = mockFetch(calls);

		try {
			const tool = createAskAutumnTool();
			if (!tool.execute) throw new Error("ask_autumn is not executable");
			const context = { mcp: { extra: { authInfo: auth } } } as never;

			await tool.execute({ message: "attach pro to cus_1" }, context);
			const response = await tool.execute(
				{ message: "can you confirm what this changes?" },
				context,
			);

			expect(String(response)).toContain("no pending billing action");
			expect(agentCalls).toBe(2);
			expect(systemPrompts.at(-1)).toContain("Pending billing action:");
			expect(calls.map((call) => call.url)).toEqual([
				"http://localhost:8080/v1/billing.preview_attach",
			]);
		} finally {
			restoreFetch();
		}
	});

	test("read requests continue when pending lookup fails", async () => {
		setPendingActionsRedis({
			multi: () => {
				throw new Error("unavailable");
			},
			get: async () => {
				throw new Error("unavailable");
			},
			getdel: async () => {
				throw new Error("unavailable");
			},
			del: async () => undefined,
			keys: async () => [],
		});
		systemPrompts.length = 0;
		agentConfirms = true;
		agentCalls = 0;
		const calls: { url: string; body: unknown }[] = [];
		const restoreFetch = mockFetch(calls);

		try {
			const tool = createAskAutumnTool();
			if (!tool.execute) throw new Error("ask_autumn is not executable");
			const context = { mcp: { extra: { authInfo: auth } } } as never;

			const response = await tool.execute({ message: "list customers" }, context);

			expect(String(response)).toContain("customers");
			expect(agentCalls).toBe(1);
			expect(calls.map((call) => call.url)).toEqual([
				"http://localhost:8080/v1/customers.list",
			]);
		} finally {
			restoreFetch();
		}
	});
});
