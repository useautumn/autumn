import { afterEach, expect, test } from "bun:test";
import { leafSkillsFor, skillToText } from "@autumn/agent-docs/agent";
import type { ToolCall } from "../lib/context.js";
import { prepareDynamicContext } from "../lib/dynamicContext.js";
import { resolveRequestIdentities } from "../lib/requestIdentities.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.TYPESAFE_API_KEY;
afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
	else process.env.TYPESAFE_API_KEY = originalKey;
});

const mockJev = (scores: Record<string, number>) => {
	process.env.TYPESAFE_API_KEY = "test-only";
	const requests: Array<{
		state: unknown;
		questions: Record<string, unknown>;
	}> = [];
	globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
		const body = JSON.parse(String(init.body));
		requests.push(body);
		return Response.json({
			answers: Object.fromEntries(
				Object.keys(body.questions).map((key) => [
					key,
					{ noul: scores[key] ?? 0 },
				]),
			),
		});
	}) as typeof fetch;
	return requests;
};

const mockReads = () => {
	const calls: ToolCall[] = [];
	return {
		calls,
		call: async (call: ToolCall) => {
			calls.push(call);
			const request = call.args.request as Record<string, unknown>;
			if (call.name === "listCustomers")
				return request.start_cursor
					? { list: [{ id: "beta" }], next_cursor: null }
					: { list: [{ id: "alpha" }], next_cursor: "customers-2" };
			if (call.name === "listEntities")
				return request.start_cursor
					? {
							list: [{ id: `${request.customer_id}-entity-2` }],
							next_cursor: null,
						}
					: {
							list: [{ id: `${request.customer_id}-entity-1` }],
							next_cursor: "entities-2",
						};
			if (call.name === "getCustomer")
				return { id: request.customer_id, subscriptions: [] };
			if (call.name === "getEntity")
				return { id: request.entity_id, subscriptions: [{ plan_id: "pro" }] };
			if (call.name === "getAgentRules")
				return { entity_rules: { attach_to_entities: true } };
			if (["listPlans", "listFeatures"].includes(call.name))
				return { list: [] };
			throw new Error(`Unexpected write: ${call.name}`);
		},
	};
};

test("user date anchors provide exact UTC arithmetic without inventing or selecting dates", async () => {
	mockJev({});
	const { call } = mockReads();
	const result = await prepareDynamicContext({
		messages: [
			{
				role: "user",
				content:
					"Start 2027-04-01; change on 2027-07-01. Repeated 2027-07-01; invalid 2027-02-30.",
			},
			{ role: "assistant", content: "Maybe 2028-01-01." },
		],
		call,
		onMeasurement: () => {},
	});
	expect(result.evidence.dateAnchors).toEqual([
		{ date: "2027-04-01", utcMidnightEpochMs: 1806537600000 },
		{ date: "2027-07-01", utcMidnightEpochMs: 1814400000000 },
	]);
});

test("selects multiple registry operations and reads every selected customer's paginated entities", async () => {
	const jev = mockJev({
		operation_attach: 1,
		operation_updateCustomer: 1,
		customer_0: 1,
		customer_1: 1,
		entity_0: 1,
	});
	const { call, calls } = mockReads();
	const messages = [
		{
			role: "user",
			content: "Attach pro to alpha and update beta's billing email.",
		},
	];
	let measurements = 0;
	const result = await prepareDynamicContext({
		messages,
		call,
		today: "2026-09-16",
		onMeasurement: () => {
			measurements++;
		},
	});
	expect(result.operations.sort()).toEqual(["attach", "updateCustomer"]);
	expect(
		calls
			.filter((item) => item.name === "getCustomer")
			.map((item) => item.args.request),
	).toEqual([{ customer_id: "alpha" }, { customer_id: "beta" }]);
	expect(calls.filter((item) => item.name === "listEntities")).toHaveLength(4);
	expect(calls.filter((item) => item.name === "getEntity")).toHaveLength(1);
	expect(
		calls.filter((item) => item.name === "listCustomers")[1]?.args.request,
	).toEqual({ limit: 100, start_cursor: "customers-2" });
	expect(result.evidence.reads).toHaveLength(calls.length);
	expect(result.evidence.facts.listCustomers).toMatchObject({
		list: [{ id: "alpha" }, { id: "beta" }],
	});
	expect(result.evidence.messages).toEqual(messages);
	expect(measurements).toBe(2);
	expect(JSON.stringify(jev[0]?.questions.operation_attach)).not.toContain(
		"requestSchema",
	);
	expect(JSON.stringify(jev[0]?.questions.operation_attach)).toContain(
		"product line",
	);
	expect(result.markdown).not.toContain('"name":"createSchedule"');
	expect(result.markdown).not.toContain('"reads":');
	expect(result.markdown).not.toContain('"requestSchema":');
	expect(jev[0]?.state).not.toHaveProperty("reads");
});

test("retains original conversation, pending and completed context on a pricing follow-up", async () => {
	const jev = mockJev({ operation_attach: 1, pending_question: 1 });
	const { call, calls } = mockReads();
	const pending = [
		{
			name: "attach",
			args: { request: { customer_id: "alpha", plan_id: "pro" } },
		},
	];
	const completed = [
		{
			call: {
				name: "updateCustomer",
				args: { request: { customer_id: "beta" } },
			},
			result: { success: true },
		},
	];
	const messages = [
		{ role: "user", content: "Put alpha on pro." },
		{ role: "user", content: "What is the price?" },
	];
	const result = await prepareDynamicContext({
		messages,
		call,
		pending,
		completed,
		today: new Date("2026-09-16T00:00:00Z"),
		onMeasurement: () => {},
	});
	expect(result.evidence).toMatchObject({
		messages,
		pending,
		completed,
		today: "2026-09-16T00:00:00.000Z",
	});
	expect(jev[1]?.state).toMatchObject({ messages, pending, completed });
	expect(result.selection.pending_question).toBe(1);
	expect(calls.filter((item) => item.name === "getCustomer")).toHaveLength(2);
});

test("read-only and clarification requests need no operation or forced entity scope", async () => {
	mockJev({ customer_0: 1 });
	const { call, calls } = mockReads();
	const result = await prepareDynamicContext({
		messages: [
			{
				role: "user",
				content: "What does alpha pay at customer scope, not an entity?",
			},
		],
		call,
		onMeasurement: () => {},
	});
	expect(result.operations).toEqual([]);
	expect(calls.some((item) => item.name === "getEntity")).toBe(false);
});

test("ambiguous selection exposes every plausible candidate without unrelated operations", async () => {
	mockJev({
		operation_attach: 0.6,
		operation_updateSubscription: 0.5,
		operation_createSchedule: 0.4,
	});
	const { call } = mockReads();
	const result = await prepareDynamicContext({
		messages: [],
		call,
		onMeasurement: () => {},
	});
	expect(result.operations).toEqual([
		"attach",
		"updateSubscription",
		"createSchedule",
	]);
});

for (const updateScore of [0.62, 0.22, 0.2]) {
	test(`multi-action routing retains cancellation capability at ${updateScore}`, async () => {
		const jev = mockJev({
			operation_attach: 0.91,
			operation_updateSubscription: updateScore,
			operation_createSchedule: 0.19,
		});
		const { call } = mockReads();
		const result = await prepareDynamicContext({
			messages: [{ role: "user", content: "Attach Beacon and cancel Summit." }],
			call,
			onMeasurement: () => {},
		});
		expect(result.operations).toEqual(["attach", "updateSubscription"]);
		expect(
			JSON.stringify(jev[0]?.questions.operation_updateSubscription),
		).toContain("cancel_immediately");
		expect(
			JSON.stringify(jev[0]?.questions.operation_updateSubscription),
		).toContain("cancel_end_of_cycle");
		expect(result.markdown).toContain(
			"Operation candidates are capabilities, not authorization",
		);
	});
}

for (const [status, mutation, retained] of [
	["active", 0.9, true],
	["active", 0, false],
	["scheduled", 0.9, false],
	["expired", 0.9, false],
] as const) {
	test(`existing ${status} subscription retains update capability only for mutation score ${mutation}`, async () => {
		const jev = mockJev({
			customer_0: 1,
			operation_attach: 0.21,
			operation_updateSubscription: 0.12,
			operation_createEntity: 0.59,
			mutation_requested: mutation,
		});
		const reads = mockReads();
		const result = await prepareDynamicContext({
			messages: [
				{
					role: "user",
					content: mutation
						? "Add the unlimited seats flag to this customer's current plan."
						: "Does this customer's current plan include unlimited seats?",
				},
			],
			call: async (call) =>
				call.name === "getCustomer"
					? {
							id: "alpha",
							subscriptions: [
								{
									id: "sub-existing",
									plan_id: "enterprise",
									status,
									plan: { id: "enterprise", items: [] },
								},
							],
						}
					: reads.call(call),
			onMeasurement: () => {},
		});
		expect(result.operations.includes("updateSubscription")).toBe(retained);
		expect(result.selection.operation_updateSubscription).toBe(0.12);
		expect(result.selection.mutation_requested).toBe(mutation);
		expect(
			JSON.stringify(jev[1]?.questions.operation_updateSubscription),
		).toContain("customize.add_items");
		expect(
			JSON.stringify(jev[1]?.questions.operation_updateSubscription),
		).toContain("customize.remove_items");
		expect(
			JSON.stringify(jev[1]?.questions.operation_updateSubscription),
		).toContain("boolean flags");
	});
}

test("customer-level attachment clarification retains existing entity subscriptions for cleanup", async () => {
	mockJev({
		customer_0: 0.96,
		operation_attach: 0.93,
		operation_updateSubscription: 0.71,
		mutation_requested: 0.95,
		entity_0: 0.22,
		entity_1: 0.32,
	});
	const reads = mockReads();
	const entities = [
		{
			id: "help-center",
			customer_id: "alpha",
			subscriptions: [
				{ id: "sub-pro", plan_id: "pro", status: "active", scope: "entity" },
			],
		},
		{
			id: "workspace",
			customer_id: "alpha",
			subscriptions: [
				{
					id: "sub-growth",
					plan_id: "growth",
					status: "active",
					scope: "entity",
					past_due: true,
				},
			],
		},
	];
	const result = await prepareDynamicContext({
		messages: [
			{
				role: "user",
				content:
					"Attach the new plan and clean up all the other subscriptions.",
			},
			{
				role: "assistant",
				content:
					"Should the new plan be attached at customer or entity level, and should the others be canceled?",
			},
			{
				role: "user",
				content:
					"Customer level, not an entity. Yes — cancel all of the others immediately, including credits add-on and past-due Growth.",
			},
		],
		call: async (call) => {
			if (call.name === "listEntities")
				return { list: entities, next_cursor: null };
			if (call.name === "getEntity")
				return entities.find(
					(entity) =>
						entity.id ===
						(call.args.request as Record<string, unknown>).entity_id,
				);
			return reads.call(call);
		},
		onMeasurement: () => {},
	});
	expect(
		result.evidence.details.filter((detail) => detail.name === "getEntity"),
	).toHaveLength(2);
	const actions = entities.map((entity) => ({
		name: "updateSubscription",
		args: {
			request: {
				customer_id: "alpha",
				entity_id: entity.id,
				subscription_id: entity.subscriptions[0]?.id,
				cancel_action: "cancel_immediately",
			},
		},
	}));
	expect(
		resolveRequestIdentities({ actions, evidence: result.evidence }).map(
			(call) => (call.args.request as Record<string, unknown>).plan_id,
		),
	).toEqual(["pro", "growth"]);
});

for (const [status, mutation, expectedReads] of [
	["active", 0, 0],
	["scheduled", 0.9, 1],
	["expired", 0.9, 0],
] as const) {
	test(`entity read retention for ${status} subscriptions with mutation ${mutation}`, async () => {
		mockJev({ customer_0: 1, mutation_requested: mutation });
		const reads = mockReads();
		const result = await prepareDynamicContext({
			messages: [
				{
					role: "user",
					content: mutation
						? "Cancel the other subscriptions."
						: "What subscriptions exist?",
				},
			],
			onMeasurement: () => {},
			call: async (call) =>
				call.name === "listEntities"
					? {
							list: [
								{
									id: "workspace",
									subscriptions: [{ id: "sub-pro", plan_id: "pro", status }],
								},
							],
							next_cursor: null,
						}
					: reads.call(call),
		});
		expect(
			result.evidence.details.filter((detail) => detail.name === "getEntity"),
		).toHaveLength(expectedReads);
	});
}

test("explicit pending entity updates retain reads even when absent from the entity list", async () => {
	mockJev({});
	const reads = mockReads();
	const pending = [
		{
			name: "updateSubscription",
			args: {
				request: {
					customer_id: "alpha",
					entity_id: "unlisted-workspace",
					subscription_id: "sub-pro",
				},
			},
		},
	];
	const result = await prepareDynamicContext({
		messages: [{ role: "user", content: "Looks good." }],
		pending,
		onMeasurement: () => {},
		call: reads.call,
	});
	expect(
		result.evidence.details.filter((detail) => detail.name === "getEntity"),
	).toEqual([
		expect.objectContaining({
			args: {
				request: { customer_id: "alpha", entity_id: "unlisted-workspace" },
			},
		}),
	]);
});

test("retained entity reads still reject tool errors", async () => {
	mockJev({ customer_0: 1, mutation_requested: 0.95, entity_0: 0.22 });
	const reads = mockReads();
	await expect(
		prepareDynamicContext({
			messages: [],
			onMeasurement: () => {},
			call: async (call) => {
				if (call.name === "listEntities")
					return {
						list: [{ id: "workspace", subscriptions: [{ status: "active" }] }],
					};
				if (call.name === "getEntity") return { isError: true };
				return reads.call(call);
			},
		}),
	).rejects.toThrow("Autumn tool returned an error");
});

test("clarification flags use post-read complete context and reach the generator", async () => {
	const flags = {
		needs_scope_clarification: 0.9,
		needs_price_clarification: 0.8,
		needs_identity_clarification: 0.7,
	};
	const jev = mockJev({ customer_0: 1, ...flags });
	const { call } = mockReads();
	const messages = [
		{ role: "user", content: "Attach the custom plan and create a workspace." },
	];
	const pending = [
		{ name: "attach", args: { request: { customer_id: "alpha" } } },
	];
	const completed = [
		{
			call: {
				name: "updateCustomer",
				args: { request: { customer_id: "alpha" } },
			},
			result: { id: "alpha" },
		},
	];
	const result = await prepareDynamicContext({
		messages,
		pending,
		completed,
		call,
		onMeasurement: () => {},
	});
	expect(result.selection).toMatchObject(flags);
	expect(jev[0]?.questions).not.toHaveProperty("needs_scope_clarification");
	expect(jev[1]?.state).toMatchObject({
		messages,
		pending,
		completed,
		details: expect.arrayContaining([
			expect.objectContaining({ name: "getCustomer" }),
			expect.objectContaining({ name: "listEntities" }),
		]),
	});
	for (const name of Object.keys(flags)) {
		expect(jev[1]?.questions).toHaveProperty(name);
		expect(result.markdown).toContain(
			`"${name}":{"score":${flags[name as keyof typeof flags]}`,
		);
	}
	expect(result.markdown).toContain(
		"Explicit customer-level scope is a valid choice",
	);
	expect(result.markdown).toContain(
		"Do not flag existing-subscription updates",
	);
	expect(result.markdown).toContain("Do not demand optional names/emails");
});

test("resolved clarification scores do not impose new missing decisions", async () => {
	mockJev({ operation_updateSubscription: 0.9 });
	const { call } = mockReads();
	const result = await prepareDynamicContext({
		messages: [
			{
				role: "user",
				content: "Cancel the existing customer-level subscription.",
			},
		],
		call,
		onMeasurement: () => {},
	});
	expect(result.selection).toMatchObject({
		needs_scope_clarification: 0,
		needs_price_clarification: 0,
		needs_identity_clarification: 0,
	});
	expect(result.operations).toEqual(["updateSubscription"]);
});

test("selected skills include transitive dependencies without unrelated skills", async () => {
	const skills = leafSkillsFor("leaf").filter(
		(skill) => skill.name !== "autumn-billing",
	);
	const investigate = skills.findIndex(
		(skill) => skill.name === "autumn-investigate",
	);
	mockJev({ [`skill_${investigate}`]: 1 });
	const { call } = mockReads();
	const result = await prepareDynamicContext({
		messages: [],
		call,
		onMeasurement: () => {},
	});
	for (const skill of skills) {
		if (["autumn-investigate", "autumn-concepts"].includes(skill.name))
			expect(result.markdown).toContain(skillToText(skill));
		else expect(result.markdown).not.toContain(skillToText(skill));
	}
});

test("pagination is bounded and keeps every authoritative page", async () => {
	mockJev({});
	let pages = 0;
	const result = await prepareDynamicContext({
		messages: [],
		onMeasurement: () => {},
		call: async ({ name }) =>
			name === "listCustomers"
				? {
						list: [{ id: `customer-${pages}` }],
						next_cursor: `cursor-${++pages}`,
					}
				: { list: [] },
	});
	expect(pages).toBe(20);
	expect(result.evidence.facts.listCustomers).toMatchObject({
		context_truncated: true,
	});
	expect(
		result.evidence.reads.filter((item) => item.name === "listCustomers"),
	).toHaveLength(20);
});

for (const failingRead of [
	"getAgentRules",
	"listPlans",
	"listFeatures",
	"listCustomers",
	"getCustomer",
	"listEntities",
	"getEntity",
]) {
	test(`rejects isError from ${failingRead}`, async () => {
		mockJev({ customer_0: 1, entity_0: 1 });
		const reads = mockReads();
		await expect(
			prepareDynamicContext({
				messages: [],
				onMeasurement: () => {},
				call: async (call) =>
					call.name === failingRead
						? { isError: true, content: [{ type: "text", text: "failure" }] }
						: reads.call(call),
			}),
		).rejects.toThrow("Autumn tool returned an error");
	});
}

test("short confirmation preserves customer and entity creation candidates", async () => {
	mockJev({
		operation_getOrCreateCustomer: 1,
		operation_createEntity: 1,
		pending_confirmation: 1,
	});
	const { call } = mockReads();
	const pending = [
		{ name: "getOrCreateCustomer", args: { request: { id: "new-customer" } } },
	];
	const result = await prepareDynamicContext({
		messages: [
			{
				role: "user",
				content: "Create customer new-customer and its workspace.",
			},
			{ role: "user", content: "looks good" },
		],
		pending,
		call,
		onMeasurement: () => {},
	});
	expect(result.operations.sort()).toEqual([
		"createEntity",
		"getOrCreateCustomer",
	]);
	expect(result.selection.pending_confirmation).toBe(1);
	expect(result.evidence.pending).toEqual(pending);
});

test("wrapped API errors fail preparation", async () => {
	mockJev({});
	await expect(
		prepareDynamicContext({
			messages: [],
			onMeasurement: () => {},
			call: async () => ({
				content: [
					{ type: "text", text: JSON.stringify({ error: "read failed" }) },
				],
			}),
		}),
	).rejects.toThrow("Autumn API returned an error");
});

test("later paginated errors are not ignored", async () => {
	mockJev({});
	const reads = mockReads();
	await expect(
		prepareDynamicContext({
			messages: [],
			onMeasurement: () => {},
			call: async (call) =>
				(call.args.request as Record<string, unknown>).start_cursor
					? { isError: true }
					: reads.call(call),
		}),
	).rejects.toThrow("Autumn tool returned an error");
});
