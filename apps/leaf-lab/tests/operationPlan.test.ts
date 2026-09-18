import { expect, test } from "bun:test";
import { CreatePlanItemParamsV1Schema, planItemV1ToV0 } from "@autumn/shared";
import {
	buildProposalSchema,
	geminiProposalSchema,
	parseOperationPlan,
	renderOperation,
	renderProposalRequestSchemas,
	validateOperationPreview,
} from "../lib/operationPlan.js";

const request = { customer_id: "customer", plan_id: "pro" };
const call = { name: "attach", args: { request } };
const preview = {
	customer_id: "customer",
	plan_id: "pro",
	total: 49,
	currency: "usd",
};
const parse = (actions: unknown[], status = "proposal") =>
	parseOperationPlan({
		allowedOperations: [
			"attach",
					"updateSubscription",
			"createSchedule",
			"updateCustomer",
			"getOrCreateCustomer",
			"createEntity",
		],
		output: { status, message: "", actions },
	});

test("explicit allowance defaults preserve the real API mapper's meaning", () => {
	const input = {
		feature_id: "credits",
		included: 100000,
		reset: { interval: "month" },
		price: { amount: 2, interval: "month", billing_method: "prepaid" },
	};
	const output = parse([
		{
			operation: "attach",
			request: { ...request, customize: { add_items: [input] } },
		},
	]);
	const normalized = (
		output.actions[0].args.request as { customize: { add_items: unknown[] } }
	).customize.add_items[0];
	expect(normalized).toMatchObject({
		unlimited: false,
		price: { max_purchase: null },
	});
	const ctx = { features: [] } as unknown as Parameters<
		typeof planItemV1ToV0
	>[0]["ctx"];
	expect(
		planItemV1ToV0({
			ctx,
			item: CreatePlanItemParamsV1Schema.parse(normalized),
		}),
	).toEqual(
		planItemV1ToV0({ ctx, item: CreatePlanItemParamsV1Schema.parse(input) }),
	);
	expect(input).not.toHaveProperty("unlimited");
	const explicit = parse([
		{
			operation: "attach",
			request: {
				...request,
				customize: {
					add_items: [
						{
							...input,
							unlimited: false,
							price: { ...input.price, max_purchase: 300 },
						},
					],
				},
			},
		},
	]);
	expect(explicit.actions[0].args.request).toMatchObject({
		customize: {
			add_items: [{ unlimited: false, price: { max_purchase: 300 } }],
		},
	});
});

test("builds only selected request schemas and slims model-only fields", () => {
	const schema = buildProposalSchema({
		operations: ["updateCustomer"],
		metadata: [
			{ name: "attach", description: "", inputSchema: {} },
			{
				name: "updateCustomer",
				description: "",
				inputSchema: {
					properties: {
						request: {
							type: "object",
							properties: {
								customer_id: { type: "string" },
								secret: { type: "string", internal: true },
							},
							required: ["customer_id", "secret"],
						},
					},
				},
			},
		],
	});
	expect(JSON.stringify(schema)).toContain("updateCustomer");
	expect(JSON.stringify(schema)).not.toContain("attach");
	expect(JSON.stringify(schema)).not.toContain("secret");
	expect(() =>
		buildProposalSchema({ operations: ["attach"], metadata: [] }),
	).toThrow("schema");
});

test("Gemini envelope keeps only the operation enum, not the attach request schema", () => {
	const schema = buildProposalSchema({
		operations: ["attach"],
		metadata: [
			{
				name: "attach",
				description: "",
				inputSchema: {
					properties: {
						request: {
							type: "object",
							properties: {
								customer_id: { type: "string" },
								nested: { anyOf: [{ type: "string" }, { type: "number" }] },
							},
							additionalProperties: false,
						},
					},
				},
			},
		],
	});
	const gemini = geminiProposalSchema(schema);
	expect(JSON.stringify(gemini)).toContain("attach");
	expect(JSON.stringify(gemini)).not.toContain("customer_id");
	expect(JSON.stringify(gemini)).not.toContain("anyOf");
	expect(JSON.stringify(gemini)).not.toContain("additionalProperties");
	expect(renderProposalRequestSchemas(schema)).toContain("customer_id");
});

test("parses a JSON-string request from the Gemini envelope", () => {
	const output = parseOperationPlan({
		allowedOperations: ["attach"],
		output: {
			status: "proposal",
			message: "",
			unsupported_obligations: [],
			actions: [
				{
					operation: "attach",
					request: JSON.stringify({
						customer_id: "atlas",
						plan_id: "pro",
					}),
				},
			],
		},
	});
	expect(output.actions[0].args.request).toMatchObject({
		customer_id: "atlas",
		plan_id: "pro",
	});
});

test("parses all supported operations through their real request schemas", () => {
	const actions = [
		{ operation: "attach", request },
		{
			operation: "updateSubscription",
			request: { ...request, cancel_action: "cancel_immediately" },
		},
		{
			operation: "createSchedule",
			request: {
				customer_id: "customer",
				phases: [{ starts_at: 1800000000000, plans: [{ plan_id: "pro" }] }],
			},
		},
		{
			operation: "updateCustomer",
			request: { customer_id: "customer", email: "billing@example.com" },
		},
		{
			operation: "getOrCreateCustomer",
			request: { customer_id: "new", email: "billing@example.com" },
		},
		{
			operation: "createEntity",
			request: {
				customer_id: "customer",
				entity_id: "workspace",
				name: "Workspace",
				feature_id: "workspaces",
			},
		},
	];
	expect(parse(actions).actions.map((call) => call.name)).toEqual(
		actions.map((action) => action.operation),
	);
	expect(() => parse([{ operation: "updateSubscription", request }])).toThrow();
	expect(() =>
		parse([{ operation: "attach", request: { customer_id: "customer" } }]),
	).toThrow();
});

test("rejects unsupported top-level attach fields instead of silently losing intent", () => {
	expect(() =>
		parse([
			{
				operation: "attach",
				request: { ...request, remove_plan_identifiers: ["legacy", "add-on"] },
			},
		]),
	).toThrow("attach.request.remove_plan_identifiers");
});

test("preserves the supported attach remove_plan_ids field", () => {
	const parsed = parse([
		{
			operation: "attach",
			request: { ...request, remove_plan_ids: ["legacy", "add-on"] },
		},
	]);
	expect(parsed.actions[0].args.request).toMatchObject({
		...request,
		remove_plan_ids: ["legacy", "add-on"],
	});
});

test("rejects unsupported nested request fields inside objects and arrays", () => {
	expect(() =>
		parse([
			{
				operation: "attach",
				request: {
					...request,
					invoice_mode: { enabled: true, send_without_approval: true },
				},
			},
		]),
	).toThrow("attach.request.invoice_mode.send_without_approval");
	expect(() =>
		parse([
			{
				operation: "attach",
				request: {
					...request,
					customize: {
						add_items: [
							{
								feature_id: "credits",
								included: 100,
								invented_overage_policy: "free",
							},
						],
					},
				},
			},
		]),
	).toThrow("attach.request.customize.add_items[0].invented_overage_policy");
	expect(() =>
		parse([
			{
				operation: "createSchedule",
				request: {
					customer_id: "customer",
					phases: [
						{
							starts_at: 1800000000000,
							plans: [{ plan_id: "pro", remove_plan_ids: ["legacy"] }],
						},
					],
				},
			},
		]),
	).toThrow("createSchedule.request.phases[0].plans[0].remove_plan_ids");
});

test("preserves legitimate dynamic metadata keys and schema-added defaults", () => {
	const metadata = {
		campaign: "fall",
		nested: { remove_plan_ids: ["analytics-label"], custom: true },
		values: [{ dynamic_key: 49 }, null, "tag"],
	};
	const parsed = parse([
		{
			operation: "getOrCreateCustomer",
			request: { customer_id: "customer", metadata },
		},
		{
			operation: "updateCustomer",
			request: { customer_id: "customer", metadata },
		},
		{
			operation: "attach",
			request: { ...request, invoice_mode: { enabled: true } },
		},
	]);
	expect(parsed.actions[0].args.request).toMatchObject({
		metadata,
		with_autumn_id: false,
	});
	expect(parsed.actions[1].args.request).toMatchObject({ metadata });
	expect(parsed.actions[2].args.request).toMatchObject({
		redirect_mode: "if_required",
		invoice_mode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: false,
		},
	});
});

test("enforces status consistency, allowlist, unknown operations and bounded plans", () => {
	expect(parse([], "answer").actions).toEqual([]);
	expect(parse([], "clarify").actions).toEqual([]);
	expect(() => parse([])).toThrow("status");
	expect(() => parse([{ operation: "attach", request }], "answer")).toThrow(
		"status",
	);
	expect(() => parse([{ operation: "deleteCustomer", request }])).toThrow();
	expect(() =>
		parse(Array(17).fill({ operation: "attach", request })),
	).toThrow();
	expect(() =>
		parseOperationPlan({
			allowedOperations: [],
			output: {
				status: "proposal",
				message: "",
				actions: [{ operation: "attach", request }],
			},
		}),
	).toThrow("not allowed");
});

test("validates mock and real preview identities and financial structure", () => {
	expect(validateOperationPreview({ call, preview })).toEqual(preview);
	expect(
		validateOperationPreview({
			call,
			preview: {
				...preview,
				plan_id: undefined,
				incoming: [{ plan_id: "pro" }],
			},
		}).total,
	).toBe(49);
	for (const invalid of [
		{ ...preview, customer_id: "other" },
		{ ...preview, plan_id: "other" },
		{ ...preview, total: NaN },
		{ ...preview, currency: "" },
		{ ...preview, error: "failed" },
		{ ...preview, line_items: [{ total: Infinity }] },
		{ ...preview, incoming: [{ plan_id: "other" }] },
	])
		expect(() =>
			validateOperationPreview({ call, preview: invalid }),
		).toThrow();
	expect(
		validateOperationPreview({
			call: {
				name: "updateSubscription",
				args: { request: { ...request, cancel_action: "cancel_immediately" } },
			},
			preview: {
				...preview,
				plan_id: undefined,
				outgoing: [{ plan_id: "pro" }],
			},
		}).total,
	).toBe(49);
});

test("checks schedule counts, dates and plan identities when exposed", () => {
	const schedule = {
		name: "createSchedule",
		args: {
			request: {
				customer_id: "customer",
				phases: [{ starts_at: 1800000000000, plans: [{ plan_id: "pro" }] }],
			},
		},
	};
	const result = {
		customer_id: "customer",
		currency: "usd",
		total: 49,
		line_items: [{ starts_at: 1800000000000, total: 49 }],
	};
	expect(
		validateOperationPreview({ call: schedule, preview: result }).total,
	).toBe(49);
	for (const invalid of [
		{ ...result, line_items: [...result.line_items, ...result.line_items] },
		{ ...result, line_items: [{ starts_at: 1, total: 49 }] },
		{ ...result, incoming: [{ plan_id: "wrong" }] },
	])
		expect(() =>
			validateOperationPreview({ call: schedule, preview: invalid }),
		).toThrow();
	expect(
		validateOperationPreview({
			call: schedule,
			preview: { ...result, line_items: [], incoming: [{ plan_id: "pro" }] },
		}).total,
	).toBe(49);
});

const evidence = {
	facts: {
		listCustomers: { list: [{ id: "customer", name: "Example Labs" }] },
		listPlans: {
			list: [
				{
					id: "pro",
					name: "Professional",
					price: { amount: 99, interval: "month" },
				},
			],
		},
		listFeatures: {
			list: [
				{ id: "credits", name: "AI Credits" },
				{ id: "history", name: "Revision History", type: "boolean" },
			],
		},
	},
	details: [
		{
			name: "listEntities",
			result: {
				list: [
					{ id: "workspace", customer_id: "customer", name: "Main Workspace" },
				],
			},
		},
	],
};

test("renders requested prices, identities, credits, removals and invoice semantics without trusting totals", () => {
	const description = renderOperation({
		call: {
			name: "attach",
			args: {
				request: {
					...request,
					entity_id: "workspace",
					customize: {
						price: { amount: 49, interval: "month" },
						add_items: [
							{
								feature_id: "credits",
								included: 100000,
								reset: { interval: "month" },
							},
						],
						remove_items: [{ feature_id: "history" }],
					},
					invoice_mode: { enabled: true, finalize: false, net_terms_days: 30 },
					enable_plan_immediately: true,
					redirect_mode: "always",
				},
			},
		},
		preview: { ...preview, total: 9999 },
		evidence,
	});
	for (const text of [
		"Example Labs",
		"Main Workspace",
		"Professional",
		"$49",
		"/month",
		"100,000",
		"AI Credits",
		"Revision History",
		"draft invoice",
		"Net 30",
		"checkout",
		"Approval required",
	])
		expect(description).toContain(text);
	expect(description).not.toContain("9999");
	expect(description).not.toContain("$0.49");
	expect(() =>
		renderOperation({
			call,
			preview: { ...preview, customer_id: "wrong" },
			evidence,
		}),
	).toThrow();
});

test("renders schedule dates and cancellation semantics deterministically", () => {
	const schedule = renderOperation({
		call: {
			name: "createSchedule",
			args: {
				request: {
					customer_id: "customer",
					phases: [
						{
							starts_at: 1800000000000,
							plans: [
								{
									plan_id: "pro",
									customize: { price: { amount: 36000, interval: "year" } },
								},
							],
						},
					],
				},
			},
		},
		evidence,
	});
	expect(schedule).toContain("Phase 1");
	expect(schedule).toContain(new Date(1800000000000).toISOString());
	expect(schedule).toContain("$36,000");
	const cancellation = renderOperation({
		call: {
			name: "updateSubscription",
			args: { request: { ...request, cancel_action: "cancel_end_of_cycle" } },
		},
		evidence,
	});
	expect(cancellation).toContain("not immediately");
	expect(cancellation.match(/Approval required/g)).toHaveLength(1);
});

test("resolves explicitly supplied new identities from pending and completed calls", () => {
	const description = renderOperation({
		call: {
			name: "attach",
			args: { request: { ...request, entity_id: "workspace" } },
		},
		evidence: {
			facts: { listPlans: evidence.facts.listPlans },
			completed: [
				{
					call: {
						name: "getOrCreateCustomer",
						args: {
							request: { customer_id: "customer", name: "New Customer" },
						},
					},
					result: { id: "customer", name: "New Customer" },
				},
			],
			pending: [
				{
					name: "createEntity",
					args: {
						request: {
							customer_id: "customer",
							entity_id: "workspace",
							name: "New Workspace",
						},
					},
				},
			],
		},
	});
	expect(description).toContain("New Customer");
	expect(description).toContain("New Workspace");
	expect(description).not.toContain("has been created");
});

test("a bare boolean grant canonicalizes to the API's unlimited form; metered items are untouched", () => {
	const output = parseOperationPlan({
		allowedOperations: ["attach"],
		booleanFeatureIds: new Set(["sso"]),
		output: {
			status: "proposal",
			message: "",
			actions: [
				{
					operation: "attach",
					request: {
						...request,
						customize: {
							add_items: [
								{ feature_id: "sso" },
								{ feature_id: "seats" },
								{ feature_id: "sso_off", unlimited: false },
							],
						},
					},
				},
			],
		},
	});
	const items = (
		output.actions[0].args.request as {
			customize: { add_items: Array<Record<string, unknown>> };
		}
	).customize.add_items;
	expect(items[0]).toMatchObject({ feature_id: "sso", unlimited: true });
	expect(items[1]).not.toHaveProperty("unlimited");
	expect(items[2]).toMatchObject({ feature_id: "sso_off", unlimited: false });
});

test("a uniform per-plan schedule entity is hoisted to the request; mixed or explicit scopes are left alone", () => {
	const phases = (entities: Array<string | null | undefined>) =>
		entities.map((entity_id, index) => ({
			...(index === 0
				? { starts_at: "now" }
				: { starting_after: { duration_type: "year", duration_count: 1 } }),
			plans: [
				{ plan_id: "pro", ...(entity_id === undefined ? {} : { entity_id }) },
			],
		}));
	const run = (body: Record<string, unknown>) =>
		parse([
			{ operation: "createSchedule", request: { customer_id: "c", ...body } },
		]).actions[0].args.request as Record<string, unknown>;
	const hoisted = run({ phases: phases(["ws", "ws"]) });
	expect(hoisted.entity_id).toBe("ws");
	expect(
		(hoisted.phases as Array<{ plans: Array<Record<string, unknown>> }>).every(
			(phase) => !("entity_id" in phase.plans[0]),
		),
	).toBe(true);
	const mixed = run({ phases: phases(["ws", "other"]) });
	expect(mixed.entity_id).toBeUndefined();
	const explicitRoot = run({ entity_id: "root", phases: phases(["ws", "ws"]) });
	expect(explicitRoot.entity_id).toBe("root");
	expect(
		(explicitRoot.phases as Array<{ plans: Array<Record<string, unknown>> }>)[0]
			.plans[0].entity_id,
	).toBe("ws");
	const customerLevel = run({ phases: phases([null, null]) });
	expect(customerLevel.entity_id).toBeUndefined();
});

test("clarify with actions is only valid as an obligation disclosure", () => {
	const envelope = (extra: Record<string, unknown>) =>
		parseOperationPlan({
			allowedOperations: ["attach"],
			output: {
				status: "clarify",
				message: "Unsupported term.",
				actions: [{ operation: "attach", request }],
				...extra,
			},
		});
	expect(() => envelope({})).toThrow("only carries actions when it discloses");
	const result = envelope({
		unsupported_obligations: [{ obligation: "No renewal", reason: "No field" }],
	});
	expect(result.status).toBe("clarify");
	expect(result.actions).toEqual([]);
	expect(result.unsupportedObligations).toHaveLength(1);
	expect(() =>
		parseOperationPlan({
			allowedOperations: ["attach"],
			output: {
				status: "answer",
				message: "x",
				actions: [{ operation: "attach", request }],
			},
		}),
	).toThrow("must not carry actions");
});
