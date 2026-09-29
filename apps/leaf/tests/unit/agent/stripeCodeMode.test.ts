import { beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const objectSchema = { properties: {}, type: "object" };
const serverTool = (name: string) => ({
	description: `${name} tool`,
	inputSchema: objectSchema,
	name,
});

const mcpCalls: { args: Record<string, unknown>; toolName: string }[] = [];
const mcpResults: Record<string, unknown> = {
	getCustomer: { id: "cus_1", stripe_id: "cus_stripe_1" },
	searchStripeEndpoints: {
		content: [{ text: JSON.stringify({ endpoints: [] }), type: "text" }],
	},
	stripeRead: {
		content: [
			{
				text: JSON.stringify({
					data: [{ id: "sub_1" }, { id: "sub_2" }],
					object: "list",
				}),
				type: "text",
			},
		],
	},
};

await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../agent/lib/autumnAuth.js",
	factory: () => ({
		mintCachedAutumnToken: async () => ({
			accessToken: "token",
			appEnv: AppEnv.Sandbox,
		}),
	}),
});
await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../agent/lib/autumnToolMetadata.js",
	factory: () => ({
		leafMcpBaseUrl: () => "http://leaf.test",
		serverToolMetadata: async () =>
			[
				"getCustomer",
				"stripeRead",
				"searchStripeEndpoints",
				"createEntity",
				"deleteCustomer",
			].map(serverTool),
	}),
});
await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../src/internal/autumnMcp/rpcClient.js",
	factory: () => ({
		callAutumnMcpTool: async ({
			args,
			toolName,
		}: {
			args: Record<string, unknown>;
			toolName: string;
		}) => {
			mcpCalls.push({ args, toolName });
			return mcpResults[toolName];
		},
	}),
});

const { autumnDirectTools } = await import(
	"../../../agent/lib/autumnDirectTools.js"
);

type EveEntry = {
	execute: (input: Record<string, unknown>, ctx: unknown) => Promise<unknown>;
};

const toolCtx = {
	session: { auth: { current: { attributes: { orgId: "org_1" } } } },
};

const stepTools = async () => {
	const dynamic = autumnDirectTools({ agent: "leaf" }) as unknown as {
		events: {
			"step.started": (
				event: unknown,
				ctx: unknown,
			) => Promise<Record<string, EveEntry>>;
		};
	};
	return dynamic.events["step.started"]({}, toolCtx);
};

const runScript = async (script: string) => {
	const tools = await stepTools();
	return tools.stripe_execute?.execute({ script }, toolCtx);
};

beforeEach(() => {
	mcpCalls.length = 0;
});

describe("Stripe code mode", () => {
	test("Stripe JSON reaches the script as JSON, not wrapped text", async () => {
		const result = await runScript(`
			const subs = await stripe.get({ path: "/v1/subscriptions", max_pages: 2 });
			return subs.data.map(s => s.id);
		`);

		expect(result).toEqual({ output: ["sub_1", "sub_2"], status: "ok" });
		expect(mcpCalls[0]?.args).toEqual({
			max_pages: 2,
			path: "/v1/subscriptions",
		});
	});

	test("a script chains Stripe reads in one stripe_execute call", async () => {
		const result = await runScript(`
			const found = await stripe.searchEndpoints({ query: "subscriptions" });
			const subs = await stripe.get({
				path: "/v1/subscriptions",
				params: { customer: "cus_stripe_1" },
			});
			return { subscriptions: subs.data.length };
		`);

		expect(result).toEqual({ output: { subscriptions: 2 }, status: "ok" });
		expect(mcpCalls.map((call) => call.toolName)).toEqual([
			"searchStripeEndpoints",
			"stripeRead",
		]);
		expect(mcpCalls[1]?.args).toEqual({
			params: { customer: "cus_stripe_1" },
			path: "/v1/subscriptions",
		});
	});

	test("Autumn tools stay direct and are not mounted in the Stripe engine", async () => {
		const tools = await stepTools();
		const result = (await runScript(
			`return await stripe.getCustomer({ request: { customer_id: "cus_1" } });`,
		)) as { status: string };

		expect(result.status).toBe("invalid");
		expect(mcpCalls).toEqual([]);
		expect(tools.autumn__getCustomer).toBeDefined();
		expect(tools.autumn__createEntity).toBeDefined();
		expect(tools.execute).toBeUndefined();
	});

	test("Stripe tools are only reachable through code mode", async () => {
		const tools = await stepTools();
		expect(tools.autumn__stripeRead).toBeUndefined();
		expect(tools.autumn__searchStripeEndpoints).toBeUndefined();
		expect(tools.stripe_execute).toBeDefined();
		expect(tools.stripe_describe).toBeDefined();
		expect(tools.stripe_search).toBeDefined();
	});
});
