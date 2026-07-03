import { describe, expect, test } from "bun:test";
import {
	claimLatestPendingAction,
	clearPendingActions,
	createPendingAction,
	setPendingActionsRedis,
} from "../../../../src/agent/pending-actions.js";
import type { AutumnMcpAuth } from "../../../../src/server/auth/auth.js";
import {
	createAgentAutumnOperationTools,
	createRawAutumnOperationTools,
	dateToEpochMillisecondsTool,
	endpointByTool,
	epochMillisecondsToDateTool,
	schemaByTool,
} from "../../../../src/tools/index.js";
import { createTestRedis } from "../../../utils/test-redis.js";

setPendingActionsRedis(createTestRedis());

type ExecutableTool = {
	execute?: (input: unknown, context: unknown) => Promise<unknown>;
};

const auth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["billing:read", "billing:write", "balances:write"],
	serverURL: "http://localhost:8080",
};

describe("Autumn operation tools", () => {
	test("read tool descriptions include composition guidance", () => {
		const tools = createRawAutumnOperationTools();

		expect(tools.listPlans.description).toContain("Plan Management resource");
		expect(tools.listPlans.description).toContain("Concepts resource");
		expect(tools.listFeatures.description).toContain("List Autumn features");
		expect(tools.listCustomers.description).toContain("plans");
		expect(tools.listCustomers.description).toContain("paginate");
		expect(tools.createEntity.description).toContain("Create an entity");
		expect(tools.createEntity.description).toContain("entity-scoped billing");
		expect(tools.updateCustomer.description).toContain("invoice_mode");
		expect(tools.updateCustomer.description).toContain("Stripe");
		expect(tools.createPlan.description).toContain("Plan Management");
		expect(tools.createPlan.description).toContain("Concepts");
		expect(tools.createBalance.description).toContain("entity-scoped credits");
		expect(tools.searchRequestLogs.description).toContain("request logs");
		expect(tools.queryRequestLogs.description).toContain("aggregate");
		expect(tools.getAgentRules.description).toContain("agent rules");
		expect(tools.getAgentRules.description).toContain("MCP API call");
		expect(tools.getAgentRules.description).toContain("never through Bash");
		expect(tools.getAgentRules.description).toContain("Use before customer");
		expect(tools.updateAgentRules.description).toContain("agent rules");
		expect(tools.listEntities.description).toContain("customer_id");
		expect(tools.listEntities.description).toContain("one customer");
		expect(tools.getEntity.description).toContain("entity_id");
		expect(tools.previewCreateBalance.description).toContain("Does not mutate");
		expect(tools.createSchedule.description).toContain("Billing resource");
		expect(tools.previewCreateSchedule.description).toContain("billing impact");
		expect(tools.previewCreateSchedule.description).toContain("Billing resource");
		expect(tools.previewAttach.description).toContain("Billing resource");
		expect(tools.attach.description).toContain("Billing resource");
		expect(tools.getCurrentOrganization.description).toContain("organization");
	});

	test("write tools are annotated as destructive", () => {
		const tools = createRawAutumnOperationTools();

		for (const name of [
			"createPlan",
			"createBalance",
			"attach",
			"updateSubscription",
			"createSchedule",
		] as const) {
			expect(tools[name].mcp?.annotations?.destructiveHint).toBe(true);
		}

		for (const name of [
			"listCustomers",
			"updateCustomer",
			"getCustomer",
			"listFeatures",
			"listPlans",
			"getPlan",
			"searchRequestLogs",
			"queryRequestLogs",
			"previewAttach",
			"previewUpdateSubscription",
			"previewCreateSchedule",
			"previewCreateBalance",
			"getCurrentOrganization",
			"getAgentRules",
			"updateAgentRules",
			"createEntity",
			"listEntities",
			"getEntity",
		] as const) {
			expect(tools[name].mcp?.annotations?.destructiveHint).toBe(false);
		}
	});

	test("listFeatures uses a strict empty request schema", () => {
		expect(endpointByTool.listFeatures).toBe("/v1/features.list");
		expect(schemaByTool.listFeatures.parse({})).toEqual({});
		expect(() =>
			schemaByTool.listFeatures.parse({ archived: false }),
		).toThrow();

		expect(createAgentAutumnOperationTools().listFeatures).toBeDefined();
	});

	test("getAgentRules uses a strict empty request schema", () => {
		expect(endpointByTool.getAgentRules).toBe("/v1/agent.get_rules");
		expect(schemaByTool.getAgentRules.parse({})).toEqual({});
		expect(() =>
			schemaByTool.getAgentRules.parse({ include_metadata: true }),
		).toThrow();

		expect(createAgentAutumnOperationTools().getAgentRules).toBeDefined();
	});

	test("entity tools expose create, list, and get schemas", () => {
		expect(endpointByTool.createEntity).toBe("/v1/entities.create");
		expect(endpointByTool.listEntities).toBe("/v1/entities.list");
		expect(endpointByTool.getEntity).toBe("/v1/entities.get");
		expect(
			schemaByTool.createEntity.parse({
				customer_id: "cus_123",
				entity_id: "workspace_1",
				feature_id: "workspaces",
				name: "Workspace 1",
			}),
		).toEqual({
			customer_id: "cus_123",
			entity_id: "workspace_1",
			feature_id: "workspaces",
			name: "Workspace 1",
		});
		expect(
			schemaByTool.listEntities.parse({
				customer_id: "cus_123",
				limit: 10,
				start_cursor: "",
			}),
		).toMatchObject({
			customer_id: "cus_123",
			limit: 10,
			start_cursor: "",
		});
		expect(
			schemaByTool.getEntity.parse({
				customer_id: "cus_123",
				entity_id: "workspace_1",
			}),
		).toEqual({
			customer_id: "cus_123",
			entity_id: "workspace_1",
		});

		expect(createAgentAutumnOperationTools().createEntity).toBeDefined();
		expect(createAgentAutumnOperationTools().listEntities).toBeDefined();
		expect(createAgentAutumnOperationTools().getEntity).toBeDefined();
	});

	test("updateAgentRules accepts partial rules and rejects unknown fields", () => {
		expect(endpointByTool.updateAgentRules).toBe("/v1/agent.update_rules");
		expect(
			schemaByTool.updateAgentRules.parse({
				entity_rules: {
					attach_to_entities: true,
					entity_feature_id: "deployments",
				},
				credit_rules: { credit_feature_id: "credits" },
				notes: "Attach add-ons at customer level.",
			}),
		).toEqual({
			entity_rules: {
				attach_to_entities: true,
				entity_feature_id: "deployments",
			},
			credit_rules: { credit_feature_id: "credits" },
			notes: "Attach add-ons at customer level.",
		});
		expect(() =>
			schemaByTool.updateAgentRules.parse({ unexpected: true }),
		).toThrow();

		expect(createAgentAutumnOperationTools().updateAgentRules).toBeDefined();
	});

	test("dateToEpochMilliseconds converts UTC dates and offsets", async () => {
		const tool = dateToEpochMillisecondsTool as ExecutableTool;
		if (!tool.execute)
			throw new Error("dateToEpochMilliseconds is not executable");

		await expect(tool.execute({ date: "2027-01-01" }, {})).resolves.toBe(
			Date.UTC(2027, 0, 1),
		);
		await expect(
			tool.execute({ date: "2027-01-01T00:00:00-08:00" }, {}),
		).resolves.toBe(Date.UTC(2027, 0, 1, 8));
	});

	test("epochMillisecondsToDate converts keyed epoch milliseconds", async () => {
		const tool = epochMillisecondsToDateTool as ExecutableTool;
		if (!tool.execute)
			throw new Error("epochMillisecondsToDate is not executable");

		await expect(
			tool.execute(
				{
					timestamps: {
						starts_at: Date.UTC(2026, 0, 1),
						expires_at: String(Date.UTC(2026, 5, 6, 12, 30, 45)),
					},
				},
				{},
			),
		).resolves.toEqual({
			starts_at: {
				epoch_ms: Date.UTC(2026, 0, 1),
				iso: "2026-01-01T00:00:00.000Z",
				utc: "January 1, 2026, 00:00:00 UTC",
			},
			expires_at: {
				epoch_ms: Date.UTC(2026, 5, 6, 12, 30, 45),
				iso: "2026-06-06T12:30:45.000Z",
				utc: "June 6, 2026, 12:30:45 UTC",
			},
		});
	});

	test("raw getOrCreateCustomer calls the get-or-create endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/customers.get_or_create",
			);
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "cus_1",
				email: "charlie@example.com",
			});
			return Response.json({ id: "cus_1" });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().getOrCreateCustomer;
			if (!tool.execute)
				throw new Error("getOrCreateCustomer is not executable");

			await expect(
				tool.execute(
					{
						intent: "create a customer",
						request: { customer_id: "cus_1", email: "charlie@example.com" },
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ id: "cus_1" });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw updateCustomer calls the update endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/customers.update");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "mintlify",
				email: "johnyeocx@gmail.com",
			});
			return Response.json({
				id: "mintlify",
				email: "johnyeocx@gmail.com",
			});
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().updateCustomer;
			if (!tool.execute) throw new Error("updateCustomer is not executable");

			await expect(
				tool.execute(
					{
						intent: "set customer email",
						request: {
							customer_id: "mintlify",
							email: "johnyeocx@gmail.com",
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({
				id: "mintlify",
				email: "johnyeocx@gmail.com",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw updateAgentRules calls the update rules endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/agent.update_rules");
			expect(JSON.parse(init?.body as string)).toEqual({
				entity_rules: {
					attach_to_entities: true,
					entity_feature_id: "deployments",
				},
				notes: "Attach add-ons at the customer level.",
			});
			return Response.json({
				entity_rules: {
					attach_to_entities: true,
					entity_feature_id: "deployments",
				},
				credit_rules: { credit_feature_id: "" },
				notes: "Attach add-ons at the customer level.",
			});
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().updateAgentRules;
			if (!tool.execute) throw new Error("updateAgentRules is not executable");

			await expect(
				tool.execute(
					{
						intent: "set org agent rules",
						request: {
							entity_rules: {
								attach_to_entities: true,
								entity_feature_id: "deployments",
							},
							notes: "Attach add-ons at the customer level.",
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toMatchObject({
				entity_rules: {
					attach_to_entities: true,
					entity_feature_id: "deployments",
				},
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw createPlan calls the create plan endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/plans.create");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				plan_id: "pro",
				name: "Pro",
			});
			return Response.json({ id: "pro" });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().createPlan;
			if (!tool.execute) throw new Error("createPlan is not executable");

			await expect(
				tool.execute(
					{ intent: "create a plan", request: { plan_id: "pro", name: "Pro" } },
					{
						mcp: { extra: { authInfo: auth } },
					} as never,
				),
			).resolves.toEqual({ id: "pro" });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw createSchedule calls the create schedule endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.create_schedule",
			);
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "cus_1",
			});
			return Response.json({ schedule_id: "sch_1" });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().createSchedule;
			if (!tool.execute) throw new Error("createSchedule is not executable");

			await expect(
				tool.execute(
					{
						intent: "create a schedule",
						request: {
							customer_id: "cus_1",
							phases: [{ starts_at: Date.now(), plans: [{ plan_id: "pro" }] }],
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ schedule_id: "sch_1" });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw previewCreateBalance returns a local non-mutating preview", async () => {
		const request = {
			customer_id: "cus_1",
			entity_id: "workspace_1",
			feature_id: "credits",
			included_grant: 50000,
			expires_at: 1785542400000,
		};
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error("previewCreateBalance should not call Autumn");
		}) as unknown as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().previewCreateBalance;
			if (!tool.execute)
				throw new Error("previewCreateBalance is not executable");

			await expect(
				tool.execute({ intent: "preview a balance grant", request }, {
					mcp: { extra: { authInfo: auth } },
				} as never),
			).resolves.toMatchObject({
				action: "createBalance",
				request,
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw createBalance calls the create balance endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/balances.create");
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				entity_id: "workspace_1",
				feature_id: "credits",
				included_grant: 50000,
				expires_at: 1785542400000,
			});
			return Response.json({ success: true });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().createBalance;
			if (!tool.execute) throw new Error("createBalance is not executable");

			await expect(
				tool.execute(
					{
						intent: "grant a balance",
						request: {
							customer_id: "cus_1",
							entity_id: "workspace_1",
							feature_id: "credits",
							included_grant: 50000,
							expires_at: 1785542400000,
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ success: true });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw previewCreateSchedule calls the preview create schedule endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.preview_create_schedule",
			);
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "cus_1",
			});
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().previewCreateSchedule;
			if (!tool.execute) {
				throw new Error("previewCreateSchedule is not executable");
			}

			await expect(
				tool.execute(
					{
						intent: "preview a schedule",
						request: {
							customer_id: "cus_1",
							phases: [{ starts_at: Date.now(), plans: [{ plan_id: "pro" }] }],
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ total: 50 });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw listCustomers calls the list endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/customers.list");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				limit: 1000,
				search: "charlie",
			});
			return Response.json({ customers: [] });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().listCustomers;
			if (!tool.execute) throw new Error("listCustomers is not executable");

			await expect(
				tool.execute(
					{
						intent: "list customers",
						request: { limit: 5000, search: "charlie" },
					},
					{
						mcp: { extra: { authInfo: auth } },
					} as never,
				),
			).resolves.toEqual({ customers: [] });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw getCurrentOrganization calls the organization me endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/organization/me");
			expect(init?.method).toBe("GET");
			expect(init?.body).toBeUndefined();
			return Response.json({
				id: "org_unit_tests",
				name: "Unit Tests",
				slug: "unit-tests",
				env: "sandbox",
				user: {
					id: "user_unit_tests",
					email: "unit@tests.dev",
					name: "Unit Tester",
				},
			});
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().getCurrentOrganization;
			if (!tool.execute) {
				throw new Error("getCurrentOrganization is not executable");
			}

			await expect(
				tool.execute(
					{ intent: "check which Autumn organization is connected" },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({
				id: "org_unit_tests",
				name: "Unit Tests",
				slug: "unit-tests",
				env: "sandbox",
				user: {
					id: "user_unit_tests",
					email: "unit@tests.dev",
					name: "Unit Tester",
				},
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw listFeatures calls the feature list endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/features.list");
			expect(JSON.parse(init?.body as string)).toEqual({});
			return Response.json({ list: [] });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().listFeatures;
			if (!tool.execute) throw new Error("listFeatures is not executable");

			await expect(
				tool.execute(
					{
						intent: "find available product features",
						request: {},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ list: [] });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw request-log tools call the logs endpoints", async () => {
		const originalFetch = globalThis.fetch;
		const calls: Array<{ url: string; body: unknown }> = [];
		globalThis.fetch = (async (url, init) => {
			calls.push({
				url: String(url),
				body: JSON.parse(init?.body as string),
			});
			return Response.json({ list: [] });
		}) as typeof fetch;

		try {
			const tools = createRawAutumnOperationTools();
			if (!tools.searchRequestLogs.execute) {
				throw new Error("searchRequestLogs is not executable");
			}
			if (!tools.queryRequestLogs.execute) {
				throw new Error("queryRequestLogs is not executable");
			}

			await expect(
				tools.searchRequestLogs.execute(
					{
						intent: "find recent failed requests",
						request: {
							query: "where status_code >= 400 | limit 10",
							limit: 10,
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ list: [] });

			await expect(
				tools.queryRequestLogs.execute(
					{
						intent: "count errors by path",
						request: {
							query:
								"where status_code >= 400 | summarize errors = count() by request_path",
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ list: [] });

			expect(calls).toEqual([
				{
					url: "http://localhost:8080/v1/logs.search",
					body: {
						query: "where status_code >= 400 | limit 10",
						limit: 10,
					},
				},
				{
					url: "http://localhost:8080/v1/logs.query",
					body: {
						query:
							"where status_code >= 400 | summarize errors = count() by request_path",
					},
				},
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw previewAttach does not create a pending action", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.preview_attach",
			);
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().previewAttach;
			if (!tool.execute) throw new Error("previewAttach is not executable");

			await expect(
				tool.execute(
					{
						intent: "preview an attach",
						request: { customer_id: "cus_1", plan_id: "pro" },
					},
					{
						mcp: { extra: { authInfo: auth } },
					} as never,
				),
			).resolves.toEqual({ total: 50 });
			await expect(claimLatestPendingAction(auth)).rejects.toThrow(
				"No pending",
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw attach calls the write endpoint directly", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/billing.attach");
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ ok: true });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().attach;
			if (!tool.execute) throw new Error("attach is not executable");

			await expect(
				tool.execute(
					{
						intent: "attach a plan",
						request: { customer_id: "cus_1", plan_id: "pro" },
					},
					{
						mcp: { extra: { authInfo: auth } },
					} as never,
				),
			).resolves.toEqual({ ok: true });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("previewAttach stores the exact pending attach action", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.preview_attach",
			);
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					previewAttach: {
						execute?: (input: unknown, context: unknown) => Promise<unknown>;
					};
				}
			).previewAttach;
			if (!tool.execute) throw new Error("previewAttach is not executable");

			await expect(
				tool.execute({ request: { customer_id: "cus_1", plan_id: "pro" } }, {
					mcp: { extra: { authInfo: auth } },
				} as never),
			).resolves.toMatchObject({ pending: true, preview: { total: 50 } });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "attach",
				request: {
					customer_id: "cus_1",
					plan_id: "pro",
					redirect_mode: "if_required",
				},
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("agent createPlan stores a pending write instead of calling Autumn", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error("createPlan should not call Autumn before confirmation");
		}) as unknown as typeof fetch;

		try {
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					createPlan: ExecutableTool;
				}
			).createPlan;
			if (!tool.execute) throw new Error("createPlan is not executable");

			await expect(
				tool.execute({ request: { plan_id: "pro", name: "Pro" } }, {
					mcp: { extra: { authInfo: auth } },
				} as never),
			).resolves.toMatchObject({ pending: true });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "createPlan",
				request: { plan_id: "pro", name: "Pro" },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("agent previewCreateSchedule stores a pending write after preview", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.preview_create_schedule",
			);
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const request = {
				customer_id: "cus_1",
				phases: [{ starts_at: Date.now(), plans: [{ plan_id: "pro" }] }],
			};
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					previewCreateSchedule: ExecutableTool;
				}
			).previewCreateSchedule;
			if (!tool.execute) {
				throw new Error("previewCreateSchedule is not executable");
			}

			await expect(
				tool.execute({ request }, {
					mcp: { extra: { authInfo: auth } },
				} as never),
			).resolves.toMatchObject({ pending: true });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "createSchedule",
				request,
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("agent previewCreateBalance stores a pending write without calling Autumn", async () => {
		await clearPendingActions();
		const request = {
			customer_id: "cus_1",
			entity_id: "workspace_1",
			feature_id: "credits",
			included_grant: 50000,
			expires_at: 1785542400000,
		};
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error("previewCreateBalance should not call Autumn");
		}) as unknown as typeof fetch;

		try {
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					previewCreateBalance: ExecutableTool;
				}
			).previewCreateBalance;
			if (!tool.execute) {
				throw new Error("previewCreateBalance is not executable");
			}

			await expect(
				tool.execute({ request }, {
					mcp: { extra: { authInfo: auth } },
				} as never),
			).resolves.toMatchObject({ pending: true });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "createBalance",
				request,
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("confirmBillingAction executes only the stored pending billing action", async () => {
		await clearPendingActions();
		await createPendingAction({
			auth,
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro",
		});
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/billing.attach");
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ ok: true });
		}) as typeof fetch;

		try {
			const tool = createAgentAutumnOperationTools().confirmBillingAction;
			if (!tool.execute)
				throw new Error("confirmBillingAction is not executable");

			await expect(
				tool.execute({}, { mcp: { extra: { authInfo: auth } } } as never),
			).resolves.toMatchObject({
				message: "Confirmed and applied attach.",
				result: { ok: true },
			});
			await expect(claimLatestPendingAction(auth)).rejects.toThrow(
				"No pending",
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("confirmBillingAction can execute a stored createBalance request", async () => {
		await clearPendingActions();
		const request = {
			customer_id: "cus_1",
			entity_id: "workspace_1",
			feature_id: "credits",
			included_grant: 50000,
			expires_at: 1785542400000,
		};
		await createPendingAction({
			auth,
			toolName: "createBalance",
			request,
			preview: "Create balance",
		});
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/balances.create");
			expect(JSON.parse(init?.body as string)).toEqual(request);
			return Response.json({ success: true });
		}) as typeof fetch;

		try {
			const tool = createAgentAutumnOperationTools().confirmBillingAction;
			if (!tool.execute)
				throw new Error("confirmBillingAction is not executable");

			await expect(
				tool.execute({}, { mcp: { extra: { authInfo: auth } } } as never),
			).resolves.toMatchObject({
				message: "Confirmed and applied createBalance.",
				result: { success: true },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
