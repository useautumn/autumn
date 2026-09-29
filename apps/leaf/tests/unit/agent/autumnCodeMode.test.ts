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
	stripeRead: { data: [{ id: "sub_1" }, { id: "sub_2" }], object: "list" },
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
	return tools.execute?.execute({ script }, toolCtx);
};

beforeEach(() => {
	mcpCalls.length = 0;
});

describe("Autumn code mode", () => {
	test("a script chains two Autumn tools in one execute call", async () => {
		const result = await runScript(`
			const customer = await autumn.getCustomer({ request: { customer_id: "cus_1" } });
			const subs = await autumn.stripeRead({
				path: "/v1/subscriptions",
				params: { customer: customer.stripe_id },
			});
			return { customerId: customer.id, subscriptions: subs.data.length };
		`);

		expect(result).toEqual({
			output: { customerId: "cus_1", subscriptions: 2 },
			status: "ok",
		});
		expect(mcpCalls.map((call) => call.toolName)).toEqual([
			"getCustomer",
			"stripeRead",
		]);
		expect(mcpCalls[1]?.args).toEqual({
			params: { customer: "cus_stripe_1" },
			path: "/v1/subscriptions",
		});
	});

	test("a gated write is not mounted in the engine, only as its direct tool", async () => {
		const tools = await stepTools();
		const result = (await runScript(`
			return await autumn.createEntity({
				approval_description: "- Create seat entity",
				request: { customer_id: "cus_1", feature_id: "seats", entity_id: "e1" },
			});
		`)) as { issues?: string[]; status: string };

		expect(result.status).toBe("invalid");
		expect(mcpCalls).toEqual([]);
		expect(tools.autumn__createEntity).toBeDefined();
	});

	test("only allowlisted tools are mounted, Stripe reads included", async () => {
		const tools = await stepTools();
		const cards = String(
			await tools.describe?.execute(
				{
					names: [
						"autumn.stripeRead",
						"autumn.searchStripeEndpoints",
						"autumn.deleteCustomer",
					],
				},
				toolCtx,
			),
		);

		expect(cards).toContain("autumn.stripeRead(");
		expect(cards).toContain("autumn.searchStripeEndpoints(");
		expect(cards).toContain("autumn.deleteCustomer - not mounted");
	});
});
