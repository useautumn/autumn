import { describe, expect, test } from "bun:test";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { MCPClient } from "@mastra/mcp";
import { parseResourceMarkdown } from "../../../../src/resources/compileResources.js";
import { autumnMcpResourceUris } from "../../../../src/resources/index.js";
import type { AutumnMcpAuth } from "../../../../src/server/auth/auth.js";
import { createAutumnOperationsMCPServer } from "../../../../src/server/server.js";

const closeServer = (server: Server) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});

const startMcpServer = () =>
	new Promise<{ url: URL; close: () => Promise<void> }>((resolve) => {
		const auth: AutumnMcpAuth = {
			apiKey: "sk_test",
			env: "sandbox",
			principalId: "test-user",
			resource: "http://localhost/mcp",
			scopes: ["plans:read"],
			serverURL: "http://localhost:8080",
		};
		const server = createServer(async (req, res) => {
			const url = new URL(req.url ?? "/mcp", `http://${req.headers.host}`);
			(req as IncomingMessage & { auth?: AutumnMcpAuth }).auth = auth;
			await createAutumnOperationsMCPServer().startHTTP({
				httpPath: "/mcp",
				req,
				res,
				url,
				options: { serverless: true },
			});
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				throw new Error("MCP test server did not bind.");
			}
			resolve({
				close: () => closeServer(server),
				url: new URL(`http://127.0.0.1:${address.port}/mcp`),
			});
		});
	});

describe("Autumn MCP server", () => {
	test("advertises Autumn MCP instructions during initialize", async () => {
		const server = await startMcpServer();
		const mcp = new MCPClient({
			id: `autumn-mcp-instructions-${crypto.randomUUID()}`,
			servers: { autumn: { url: server.url } },
		});

		try {
			await mcp.listToolsetsWithErrors();
			const instructions = mcp.getServerInstructions().autumn;

			expect(instructions).toContain("# Autumn MCP Instructions");
			expect(instructions).toContain("autumn://docs/plan-management");
			expect(instructions).toContain("call them in the same tool batch");
			expect(instructions).toContain(
				"Use preview tools before billing writes.",
			);
		} finally {
			await mcp.disconnect();
			await server.close();
		}
	});

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

	test("public server exposes Autumn docs", async () => {
		const server = createAutumnOperationsMCPServer();
		const resources = await server.listResources();
		const resourceUris = autumnMcpResourceUris();

		expect(resourceUris).toEqual([
			"autumn://docs/concepts",
			"autumn://docs/plan-management",
			"autumn://docs/billing",
		]);
		expect(resources.resources.map((resource) => resource.uri)).toEqual(
			resourceUris,
		);

		for (const uri of resourceUris) {
			const resource = await server.readResource(uri);
			expect(resource.contents[0]?.text).toContain("# ");
		}

		const concepts = await server.readResource("autumn://docs/concepts");
		const conceptsText = String(concepts.contents[0]?.text ?? "");
		expect(conceptsText.indexOf("## Intro")).toBeLessThan(
			conceptsText.indexOf("### Feature"),
		);
		expect(conceptsText).toContain("Autumn is a database");
		expect(conceptsText).toContain("## Object Graph");
		expect(conceptsText).toContain("### Plan");
		expect(conceptsText).toContain("### Customer and Entity");
		expect(conceptsText).toContain("### Billing Controls");
		expect(conceptsText).toContain("actual balance source");
		expect(conceptsText).toContain("Auto top-ups are customer-level only");
		expect(conceptsText).toContain("Never use `auto_enable: true`");
		expect(conceptsText).toContain('no concept of "variants"');
		expect(conceptsText).toContain("`pro_monthly` or `pro_annual`");
		expect(conceptsText).toContain("Do not create duplicate features");
		expect(conceptsText).toContain("`monthly_tokens` and `one_time_tokens`");
		expect(conceptsText).toContain(
			"Boolean/unlimited feature grants use `unlimited: true`",
		);
		expect(conceptsText).toContain("Boolean plan items cannot be paid today");
		expect(conceptsText).toContain("concurrency limit of 10");

		const planManagement = await server.readResource(
			"autumn://docs/plan-management",
		);
		const planManagementText = String(planManagement.contents[0]?.text ?? "");
		expect(planManagementText).toContain("# Plan Management");
		expect(planManagementText).toContain("Building pricing is iterative");
		expect(planManagementText).toContain("never assume behavior");
		expect(planManagementText).toContain("usage-based or prepaid");

		const billing = await server.readResource("autumn://docs/billing");
		const billingText = String(billing.contents[0]?.text ?? "");
		expect(billingText).toContain("# Billing");
		expect(billingText).toContain("Read `autumn://docs/concepts`");
		expect(billingText).toContain("<goal>");
		expect(billingText).toContain("<action-selection>");
		expect(billingText).toContain("<target-resolution>");
		expect(billingText).toContain(
			"If preloaded `listPlans` / `listFeatures` results are present",
		);
		expect(billingText).toContain(
			"Do not call them again unless the needed record is absent or the user asks to refresh",
		);
		expect(billingText.indexOf("<target-resolution>")).toBeLessThan(
			billingText.indexOf("<action-selection>"),
		);
		expect(billingText.indexOf("<action-selection>")).toBeLessThan(
			billingText.indexOf("<param-checklist>"),
		);
		expect(billingText.indexOf("<param-checklist>")).toBeLessThan(
			billingText.indexOf("<customizations>"),
		);
		expect(billingText.indexOf("<customizations>")).toBeLessThan(
			billingText.indexOf("<timing-and-schedules>"),
		);
		expect(billingText.indexOf("<timing-and-schedules>")).toBeLessThan(
			billingText.indexOf("<billing-behavior>"),
		);
		expect(billingText.indexOf("<billing-behavior>")).toBeLessThan(
			billingText.indexOf("<preview-and-approval>"),
		);
		expect(billingText.indexOf("<preview-and-approval>")).toBeLessThan(
			billingText.indexOf("<completion-response>"),
		);
		expect(billingText).toContain(
			"Usually choose `attach` or `updateSubscription`",
		);
		expect(billingText).toContain(
			"You MUST follow this checklist in order for every billing request",
		);
		expect(billingText).toContain("Resolve targets with <target-resolution>");
		expect(billingText).toContain(
			"Choose the operation with <action-selection>",
		);
		expect(billingText).toContain(
			"Collect action-specific params with <param-checklist>",
		);
		expect(billingText).toContain("Resolve custom terms with <customizations>");
		expect(billingText).toContain("Resolve timing with <timing-and-schedules>");
		expect(billingText).toContain(
			"Resolve invoice, checkout, and proration behavior with <billing-behavior>",
		);
		expect(billingText).toContain(
			"Gather all missing questions from the checklist and ask them together",
		);
		expect(billingText).toContain(
			"If there are no missing questions, call the preview tool",
		);
		expect(billingText).toContain(
			"If the user approves the preview, execute the exact previewed billing action",
		);
		expect(billingText).toContain("<param-checklist>");
		expect(billingText).toContain("Do not use `update_items`");
		expect(billingText).toContain("Change prepaid to usage-based");
		expect(billingText).toContain('plan_schedule: "immediate"');
		expect(billingText).toContain("<attach-timing>");
		expect(billingText).toContain("dateToEpochMilliseconds");
		expect(billingText).toContain("pass the literal `now`");
		expect(billingText).toContain("addInterval");
		expect(billingText).toContain("Future first-phase `starts_at`");
		expect(billingText).toContain("<billing-behavior>");
		expect(billingText).toContain(
			"Default operator-led billing actions to invoice mode",
		);
		expect(billingText).toContain(
			"Use invoice mode even when the immediate charge is $0",
		);
		expect(billingText).toContain("invoice_mode.finalize: false");
		expect(billingText).toContain('redirect_mode: "always"');
		expect(billingText).toContain("Default proration to `none`");
		expect(billingText).toContain(
			'If the customer has no existing subscriptions, do not pass `proration_behavior: "none"`',
		);
		expect(billingText).toContain("<preview-and-approval>");
		expect(billingText).toContain(
			"APPROVAL MUST BE GRANTED BEFORE PERFORMING ANY MUTATING BILLING ACTION",
		);
		expect(billingText).toContain("Monetary amounts are major currency units");
		expect(billingText).toContain(
			"Read this full resource before billing work",
		);
		expect(billingText).toContain("call `updateCustomer` before previewing");
		expect(billingText).toContain("one bullet point per question");
		expect(billingText).toContain("do not explain plan internals");
		expect(billingText).toContain(
			"resolve any required `customize` params identified in <customizations>",
		);
		expect(billingText).toContain(
			"If the plan has prepaid items and quantity is missing",
		);
		expect(billingText).toContain("cancel now vs cancel at end of cycle");
		expect(billingText).toContain("`feature_quantities.quantity` is inclusive");
		expect(
			billingText.match(
				/ask the user whether they want to customize the base price/g,
			) ?? [],
		).toHaveLength(1);
		expect(billingText).toContain("Enterprise or custom placeholder plan");
		expect(billingText).toContain("determine immediate billing impact");
		expect(billingText).toContain("Lead with immediate impact");
		expect(billingText).toContain("facts that affect approval");
		expect(billingText).toContain("Apply only the exact previewed request");
		expect(billingText).toContain("<completion-response>");
		expect(billingText).toContain("payment_url");
		expect(billingText).toContain("invoice.hosted_invoice_url");
		expect(billingText).toContain("Stripe dashboard invoice URL");
		expect(billingText).toContain(
			"https://dashboard.stripe.com/test/invoices/{stripe_id}",
		);
		expect(billingText).toContain(
			"https://dashboard.stripe.com/invoices/{stripe_id}",
		);
		expect(billingText).toContain("quote the server error/status clearly");
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
