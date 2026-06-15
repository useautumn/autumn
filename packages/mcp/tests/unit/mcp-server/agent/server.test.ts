import { describe, expect, test } from "bun:test";
import { parseResourceMarkdown } from "../../../../src/resources/compileResources.js";
import { autumnMcpResourceUris } from "../../../../src/resources/index.js";
import { createAutumnOperationsMCPServer } from "../../../../src/server/server.js";

describe("Autumn MCP server", () => {
	const logResourceUris = [
		"autumn://docs/request-logs",
		"autumn://docs/request-log-customers",
		"autumn://docs/request-log-balances",
		"autumn://docs/request-log-billing",
		"autumn://docs/request-log-stripe-webhooks",
		"autumn://docs/request-log-analytics",
	] as const;

	test("public server advertises raw operation tools", async () => {
		const tools = await createAutumnOperationsMCPServer().getToolListInfo();

		expect(tools.tools.map((tool) => tool.name)).toEqual([
			"getAgentRules",
			"updateAgentRules",
			"listCustomers",
			"getOrCreateCustomer",
			"updateCustomer",
			"getCustomer",
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

	test("public server exposes Autumn composition docs", async () => {
		const server = createAutumnOperationsMCPServer();
		const resources = await server.listResources();
		const resourceUris = autumnMcpResourceUris();

		expect(resources.resources.map((resource) => resource.uri)).toEqual(
			resourceUris,
		);

		for (const uri of resourceUris) {
			const resource = await server.readResource(uri);
			expect(resource.contents[0]?.text).toContain("# ");
		}

		const requestLogs = await server.readResource("autumn://docs/request-logs");
		expect(requestLogs.contents[0]?.text).toContain("searchRequestLogs");
		expect(requestLogs.contents[0]?.text).toContain("queryRequestLogs");

		const featureCatalog = await server.readResource(
			"autumn://docs/feature-catalog",
		);
		expect(featureCatalog.contents[0]?.text).toContain("listFeatures");

		const billingSafety = await server.readResource(
			"autumn://docs/billing-safety",
		);
		expect(billingSafety.contents[0]?.text).toContain(
			"invoice_mode requires customer email",
		);
		expect(billingSafety.contents[0]?.text).toContain("finalize false");
		expect(billingSafety.contents[0]?.text).toContain("updateCustomer");

		const schedules = await server.readResource("autumn://docs/schedules");
		expect(schedules.contents[0]?.text).toContain(
			"invoice_mode requires customer email",
		);
		expect(schedules.contents[0]?.text).toContain("finalize false");
		expect(schedules.contents[0]?.text).toContain("updateCustomer");

		for (const uri of logResourceUris) {
			expect(resourceUris).toContain(uri);
		}
	});

	test("log resources stay external-safe", async () => {
		const server = createAutumnOperationsMCPServer();
		const bannedTerms = [
			"Axiom",
			"extras",
			"workflow",
			"req.id",
			"msg",
			"level",
			"server/src",
			"implementation files",
			"database state",
			"stack traces",
		];

		for (const uri of logResourceUris) {
			const resource = await server.readResource(uri);
			const text = String(resource.contents[0]?.text ?? "");
			for (const term of bannedTerms) {
				expect(text).not.toContain(term);
			}
		}
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
