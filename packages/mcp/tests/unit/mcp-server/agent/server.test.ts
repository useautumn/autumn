import { describe, expect, test } from "bun:test";
import { parseResourceMarkdown } from "../../../../src/resources/compileResources.js";
import { autumnMcpResourceUris } from "../../../../src/resources/index.js";
import { createAutumnOperationsMCPServer } from "../../../../src/server/server.js";

describe("Autumn MCP server", () => {
	test("public server advertises raw operation tools", async () => {
		const tools = await createAutumnOperationsMCPServer().getToolListInfo();

		expect(tools.tools.map((tool) => tool.name)).toEqual([
			"getAgentRules",
			"updateAgentRules",
			"listCustomers",
			"getOrCreateCustomer",
			"updateCustomer",
			"getCustomer",
			"createEntity",
			"listEntities",
			"getEntity",
			"listFeatures",
			"listPlans",
			"createPlan",
			"getPlan",
			"createBalance",
			"searchRequestLogs",
			"queryRequestLogs",
			"previewAttach",
			"previewUpdateSubscription",
			"previewCreateSchedule",
			"previewCreateBalance",
			"attach",
			"updateSubscription",
			"createSchedule",
			"getCurrentOrganization",
			"dateToEpochMilliseconds",
			"epochMillisecondsToDate",
		]);
		expect(tools.tools.map((tool) => tool.name)).not.toContain("ask_autumn");
		expect(tools.tools.map((tool) => tool.name)).not.toContain(
			"confirmBillingAction",
		);
	});

	test("billing tool schemas avoid legacy JSON Schema ids", async () => {
		const tools = await createAutumnOperationsMCPServer().getToolListInfo();

		for (const name of [
			"previewAttach",
			"attach",
			"previewUpdateSubscription",
			"updateSubscription",
		]) {
			const tool = tools.tools.find((tool) => tool.name === name);
			expect(JSON.stringify(tool?.inputSchema)).not.toContain('"id":');
		}
	});

	test("public server exposes Autumn billing docs", async () => {
		const server = createAutumnOperationsMCPServer();
		const resources = await server.listResources();
		const resourceUris = autumnMcpResourceUris();

		expect(resourceUris).toEqual(["autumn://docs/billing"]);
		expect(resources.resources.map((resource) => resource.uri)).toEqual(
			resourceUris,
		);

		for (const uri of resourceUris) {
			const resource = await server.readResource(uri);
			expect(resource.contents[0]?.text).toContain("# ");
		}

		const billing = await server.readResource("autumn://docs/billing");
		const billingText = String(billing.contents[0]?.text ?? "");
		expect(billingText).toContain("previewUpdateSubscription");
		expect(billingText).toContain("updateSubscription");
		expect(billingText).toContain("previewAttach");
		expect(billingText).toContain("previewCreateSchedule");
		expect(billingText).toContain("explicit approval");
		expect(billingText).toContain("### Customer and Entity");
		expect(billingText).toContain("### Billing Controls");
		expect(billingText).toContain("breakdown[]");
		expect(billingText).toContain("Auto top-ups are customer-level only");
	});

	test("unknown resources are rejected", async () => {
		const server = createAutumnOperationsMCPServer();

		await expect(server.readResource("autumn://docs/missing")).rejects.toThrow(
			"Unknown Autumn MCP resource",
		);
		await expect(server.readResource("__proto__")).rejects.toThrow(
			"Unknown Autumn MCP resource",
		);
	});

	test("resource markdown parser validates frontmatter", () => {
		expect(
			parseResourceMarkdown({
				path: "logs/request-logs.md",
				text: [
					"---",
					"name: request-logs",
					"title: Request Logs",
					"description: Log docs",
					"---",
					"# Request Logs",
				].join("\n"),
			}),
		).toMatchObject({
			name: "request-logs",
			title: "Request Logs",
			description: "Log docs",
			priority: 0.8,
			audience: ["assistant"],
			body: "# Request Logs",
		});

		expect(() =>
			parseResourceMarkdown({
				path: "bad.md",
				text: "---\ntitle: Missing Name\ndescription: Bad\n---\n# Bad",
			}),
		).toThrow("missing name");
	});
});
