import { expect, test } from "bun:test";
import type { ToolCall } from "../lib/context.js";
import { createSingleExecution } from "../lib/singleExecution.js";

type Dependencies = Parameters<typeof createSingleExecution>[0];
type PreparedInput = Parameters<NonNullable<Dependencies["prepare"]>>[0];
type VerifiedInput = Parameters<NonNullable<Dependencies["verify"]>>[0];

const names = [
	"attach",
	"updateSubscription",
	"createSchedule",
	"updateCustomer",
	"getOrCreateCustomer",
	"createEntity",
];
const attach = {
	operation: "attach",
	request: {
		customer_id: "customer",
		plan_id: "pro",
		customize: { price: { amount: 49, interval: "month" } },
		invoice_mode: { enabled: true, finalize: false },
		enable_plan_immediately: true,
	},
};
const update = {
	operation: "updateCustomer",
	request: { customer_id: "customer", email: "billing@example.com" },
};
const proposal = (actions: unknown[]) => ({
	status: "proposal",
	message: "",
	actions,
});

const harness = ({
	outputs,
	readResult,
	verifyError,
}: {
	outputs: unknown[];
	readResult?: (call: ToolCall) => unknown;
	verifyError?: string;
}) => {
	const calls: ToolCall[] = [];
	const events: Record<string, unknown>[] = [];
	const preparations: PreparedInput[] = [];
	const verifications: VerifiedInput[] = [];
	const generations: Parameters<Dependencies["generate"]>[0][] = [];
	const contexts: string[] = [];
	let selection: Record<string, number> = {};
	const execution = createSingleExecution({
		metadata: names.map((name) => ({
			name,
			description: name,
			inputSchema: {
				type: "object",
				properties: { request: { type: "object", additionalProperties: true } },
			},
		})),
		read: async (call) => {
			calls.push(structuredClone(call));
			const override = readResult?.(call);
			if (override !== undefined) return override;
			const request = call.args.request as Record<string, unknown>;
			if (call.name === "listEntities") return { list: [] };
			if (call.name.startsWith("preview"))
				return {
					customer_id: request.customer_id,
					plan_id: request.plan_id,
					currency: "usd",
					total: 49,
				};
			return { customer_id: request.customer_id, status: "success" };
		},
		prepare: async (input) => {
			preparations.push({
				...input,
				messages: structuredClone(input.messages),
				pending: structuredClone(input.pending),
				completed: structuredClone(input.completed),
			});
			return {
				operations: names,
				selection,
				markdown: "Authoritative test context",
				evidence: {
					messages: structuredClone(input.messages),
					pending: structuredClone(input.pending ?? []),
					completed: structuredClone(input.completed ?? []),
					today: "2026-09-16T00:00:00.000Z",
					dateAnchors: [],
					dateAnchorMeaning:
						"No date strings were supplied in this injected context.",
					facts: {
						listPlans: { list: [{ id: "pro", name: "Professional" }] },
						listCustomers: {
							list: [{ id: "customer", name: "Example Customer" }],
						},
						listFeatures: { list: [] },
					},
					details: [
						{
							name: "getCustomer",
							args: { request: { customer_id: "customer" } },
							result: {
								id: "customer",
								subscriptions: [
									{
										id: "old-subscription",
										plan_id: "old-plan",
										status: "active",
									},
								],
							},
						},
					],
					reads: [],
				},
			};
		},
		verify: async (input) => {
			verifications.push({
				...input,
				actions: structuredClone(input.actions),
				evidence: structuredClone(input.evidence),
			});
			if (verifyError) throw new Error(verifyError);
			input.onVerdict({ wrong_target: 0 });
			return { wrong_target: 0 };
		},
		generate: async (input) => {
			generations.push(structuredClone(input));
			if (!outputs.length) throw new Error("Unexpected model generation");
			return structuredClone(outputs.shift());
		},
		setContext: (markdown) => contexts.push(markdown),
		record: (event) => events.push(structuredClone(event)),
		onMeasurement: () => {
			throw new Error("No paid measurement is expected in injected tests");
		},
	});
	return {
		...execution,
		calls,
		events,
		preparations,
		verifications,
		generations,
		contexts,
		select: (next: Record<string, number>) => {
			selection = next;
		},
		writes: () => calls.filter((call) => names.includes(call.name)),
	};
};

test("an unapproved billing proposal only previews and verifies, then executes the exact request once", async () => {
	const run = harness({ outputs: [proposal([attach])] });
	await run.send("Attach the customized Professional plan after approval");
	expect(run.hasPendingApproval()).toBe(true);
	expect(run.calls.map((call) => call.name)).toEqual(["previewAttach"]);
	expect(run.writes()).toEqual([]);
	expect(run.verifications).toHaveLength(1);
	expect(run.verifications[0].actions).toHaveLength(1);
	expect(run.contexts).toEqual(["Authoritative test context"]);
	const preview = structuredClone(run.calls[0]);
	await run.approve();
	expect(run.writes()).toEqual([{ ...preview, name: "attach" }]);
	expect(run.hasPendingApproval()).toBe(false);
	await expect(run.approve()).rejects.toThrow("No proposal");
	expect(run.writes()).toHaveLength(1);
});

test("relative schedule timing is resolved once before preview and the exact numeric request executes", async () => {
	const run = harness({
		outputs: [
			proposal([
				{
					operation: "createSchedule",
					request: {
						customer_id: "customer",
						phases: [
							{ starts_at: "now", plans: [{ plan_id: "pro" }] },
							{
								starting_after: { duration_type: "year", duration_count: 1 },
								plans: [{ plan_id: "pro" }],
							},
						],
					},
				},
			]),
		],
	});
	await run.send("Create a two-year schedule starting today.");
	expect(run.calls).toHaveLength(1);
	expect(run.calls[0].name).toBe("previewCreateSchedule");
	expect(run.calls[0].args.request).toMatchObject({
		phases: [
			{ starts_at: Date.parse("2026-09-16T00:00:00.000Z") },
			{ starts_at: Date.parse("2027-09-16T00:00:00.000Z") },
		],
	});
	expect(run.verifications[0].actions[0].args).toEqual(run.calls[0].args);
	const preview = structuredClone(run.calls[0]);
	await run.approve();
	expect(run.writes()).toEqual([{ ...preview, name: "createSchedule" }]);
});

test("each approval executes one action and only then previews the dependent action", async () => {
	const run = harness({ outputs: [proposal([update, attach])] });
	await run.send("Update the billing email, then attach Professional");
	expect(run.calls).toEqual([]);
	expect(run.hasPendingApproval()).toBe(true);
	await run.approve();
	expect(run.calls.map((call) => call.name)).toEqual([
		"updateCustomer",
		"previewAttach",
	]);
	expect(run.writes()).toHaveLength(1);
	expect(run.hasPendingApproval()).toBe(true);
	expect(
		run.preparations.at(-1)?.completed?.map((entry) => entry.call.name),
	).toEqual(["updateCustomer"]);
	expect(run.verifications.at(-1)?.actions.map((call) => call.name)).toEqual([
		"attach",
	]);
	await run.approve();
	expect(run.calls.map((call) => call.name)).toEqual([
		"updateCustomer",
		"previewAttach",
		"attach",
	]);
	expect(run.writes()).toHaveLength(2);
	expect(run.hasPendingApproval()).toBe(false);
});

test("questions and textual confirmations preserve the stored request without repeated previews or writes", async () => {
	const run = harness({
		outputs: [
			proposal([attach]),
			{
				status: "answer",
				message: "The proposal is $49 per month.",
				actions: [],
			},
		],
	});
	await run.send("Attach Professional for $49 monthly");
	const original = structuredClone(run.calls[0]);
	run.select({ pending_question: 1 });
	const answer = await run.send("What price did we agree?");
	expect(answer.text).toContain("$49");
	expect(run.hasPendingApproval()).toBe(true);
	expect(run.calls).toEqual([original]);
	expect(run.generations.at(-1)?.outputSchema).toMatchObject({
		properties: { actions: { maxItems: 0 } },
	});
	run.select({ pending_confirmation: 1 });
	await run.send("Yes, please approve it");
	expect(run.generations).toHaveLength(2);
	expect(run.calls).toEqual([original]);
	expect(run.writes()).toEqual([]);
	await run.approve();
	expect(run.writes()).toEqual([{ ...original, name: "attach" }]);
	expect(
		run.events.filter(
			(event) => event.kind === "approval_ready" && event.retained,
		),
	).toHaveLength(2);
});

test("an identical regenerated proposal retains the existing preview", async () => {
	const run = harness({ outputs: [proposal([attach]), proposal([attach])] });
	await run.send("Attach Professional");
	await run.send("Keep those terms");
	expect(run.calls.map((call) => call.name)).toEqual(["previewAttach"]);
	expect(run.verifications).toHaveLength(1);
	await run.approve();
	expect(run.writes()).toHaveLength(1);
});

test("queued billing changes each get a fresh preview and their own approval", async () => {
	const cancel = {
		operation: "updateSubscription",
		request: {
			customer_id: "customer",
			plan_id: "old-plan",
			cancel_action: "cancel_immediately",
		},
	};
	const run = harness({ outputs: [proposal([attach, cancel])] });
	await run.send("Attach Professional, then cancel the old plan immediately");
	expect(run.calls.map((call) => call.name)).toEqual(["previewAttach"]);
	await run.approve();
	expect(run.calls.map((call) => call.name)).toEqual([
		"previewAttach",
		"attach",
		"previewUpdateSubscription",
	]);
	expect(run.writes()).toHaveLength(1);
	expect(run.hasPendingApproval()).toBe(true);
	const cancellationPreview = structuredClone(run.calls[2]);
	await run.approve();
	expect(run.calls[3]).toEqual({
		...cancellationPreview,
		name: "updateSubscription",
	});
	expect(run.hasPendingApproval()).toBe(false);
});

test("semantic rejection has exactly one repair attempt and leaves no pending gate or writes", async () => {
	const run = harness({
		outputs: [proposal([attach]), proposal([attach])],
		verifyError: "Plan requires correction: wrong_target",
	});
	await expect(run.send("Attach to the requested customer")).rejects.toThrow(
		"wrong_target",
	);
	expect(run.generations).toHaveLength(2);
	expect(run.generations[1].message).toContain("Validation failed");
	expect(run.verifications).toHaveLength(2);
	expect(run.hasPendingApproval()).toBe(false);
	expect(run.writes()).toEqual([]);
	expect(run.events.filter((event) => event.kind === "repair")).toHaveLength(2);
	await expect(run.approve()).rejects.toThrow("No proposal");
});

test("invalid action schemas exhaust repair without even calling a preview", async () => {
	const invalid = proposal([
		{ operation: "attach", request: { customer_id: "customer" } },
	]);
	const run = harness({ outputs: [invalid, invalid] });
	await expect(run.send("Attach a plan")).rejects.toThrow();
	expect(run.generations).toHaveLength(2);
	expect(run.calls).toEqual([]);
	expect(run.hasPendingApproval()).toBe(false);
});

test("rejected provisioning never creates records even during bounded repair", async () => {
	const create = proposal([
		{
			operation: "getOrCreateCustomer",
			request: { customer_id: "unknown", email: "billing@example.com" },
		},
		attach,
	]);
	const run = harness({
		outputs: [create, create],
		verifyError: "unrequested_creation",
	});
	await expect(run.send("Find the customer's plan")).rejects.toThrow(
		"unrequested_creation",
	);
	expect(run.generations).toHaveLength(2);
	expect(run.calls).toEqual([]);
	expect(run.hasPendingApproval()).toBe(false);
});

test("explicit provisioning uses raw MCP before the billing gate, then refreshes completed evidence", async () => {
	const createCustomer = {
		operation: "getOrCreateCustomer",
		request: {
			customer_id: "customer",
			name: "New Customer",
			email: "billing@example.com",
		},
	};
	const createEntity = {
		operation: "createEntity",
		request: {
			customer_id: "customer",
			entity_id: "workspace",
			name: "New Workspace",
			feature_id: "workspaces",
		},
	};
	const run = harness({
		outputs: [
			proposal([
				createCustomer,
				createEntity,
				{ ...attach, request: { ...attach.request, entity_id: "workspace" } },
			]),
		],
	});
	await run.send(
		"Create this new customer and workspace, then attach Professional",
	);
	expect(run.calls.map((call) => call.name)).toEqual([
		"getOrCreateCustomer",
		"listEntities",
		"createEntity",
		"previewAttach",
	]);
	expect(run.writes().map((call) => call.name)).toEqual([
		"getOrCreateCustomer",
		"createEntity",
	]);
	expect(run.hasPendingApproval()).toBe(true);
	expect(
		run.preparations.at(-1)?.completed?.map((entry) => entry.call.name),
	).toEqual(["getOrCreateCustomer", "createEntity"]);
	expect(
		run.verifications.map((input) => input.actions.map((call) => call.name)),
	).toEqual([["getOrCreateCustomer", "createEntity", "attach"], ["attach"]]);
	await run.approve();
	expect(run.writes().map((call) => call.name)).toEqual([
		"getOrCreateCustomer",
		"createEntity",
		"attach",
	]);
});

test.each(["answer", "clarify"])(
	"a %s response creates no gate and performs no writes",
	async (status) => {
		const run = harness({
			outputs: [
				{ status, message: "Please identify the customer.", actions: [] },
			],
		});
		expect(await run.send("Which customer?")).toEqual({
			text: "Please identify the customer.",
		});
		expect(run.hasPendingApproval()).toBe(false);
		expect(run.calls).toEqual([]);
		expect(run.verifications).toEqual([]);
		await expect(run.approve()).rejects.toThrow("No proposal");
	},
);

test.each([
	{ label: "raw API error", result: { error: "Update failed" } },
	{
		label: "MCP error",
		result: {
			isError: true,
			content: [{ type: "text", text: "Update failed" }],
		},
	},
	{
		label: "payment action",
		result: { required_action: { code: "payment_failed", reason: "Declined" } },
	},
])(
	"a $label stops the remaining actions after approval",
	async ({ result }) => {
		const run = harness({
			outputs: [proposal([update, attach])],
			readResult: (call) =>
				call.name === "updateCustomer" ? result : undefined,
		});
		await run.send("Update the email before attaching Professional");
		await expect(run.approve()).rejects.toThrow();
		expect(run.calls.map((call) => call.name)).toEqual(["updateCustomer"]);
		expect(run.hasPendingApproval()).toBe(false);
		await expect(run.approve()).rejects.toThrow("No proposal");
		expect(run.calls.map((call) => call.name)).toEqual(["updateCustomer"]);
	},
);

test("a failed pending-question repair does not discard the already verified approval", async () => {
	const run = harness({
		outputs: [proposal([attach]), proposal([attach]), proposal([attach])],
	});
	await run.send("Attach Professional");
	const original = structuredClone(run.calls[0]);
	run.select({ pending_question: 1 });
	await expect(run.send("What does this cost?")).rejects.toThrow("not allowed");
	expect(run.hasPendingApproval()).toBe(true);
	expect(run.calls).toEqual([original]);
	await run.approve();
	expect(run.writes()).toEqual([{ ...original, name: "attach" }]);
});

test("a proposal that lists unsupported obligations must first disclose them as a clarification", async () => {
	const run = harness({
		outputs: [
			{
				status: "proposal",
				message: "",
				actions: [attach],
				unsupported_obligations: [
					{
						obligation: "No automatic renewal after 24 months",
						reason: "No end-of-term field",
					},
				],
			},
			{
				status: "clarify",
				message:
					"The 24-month no-renewal term cannot be represented; manual cancellation follow-up is required. Proceed?",
				actions: [],
				unsupported_obligations: [
					{
						obligation: "No automatic renewal after 24 months",
						reason: "No end-of-term field",
					},
				],
			},
		],
	});
	await run.send("Provision the signed order form.");
	expect(run.calls).toEqual([]);
	expect(run.hasPendingApproval()).toBe(false);
	expect(
		run.events.some(
			(event) => event.kind === "unsupported_obligations_disclosed",
		),
	).toBe(true);
	const repair = run.events.find((event) => event.kind === "repair");
	expect(String(repair?.error)).toContain(
		"cannot silently carry unsupported obligations",
	);
});

test("after disclosure, the verifier receives the disclosed obligations as evidence", async () => {
	const run = harness({
		outputs: [
			{
				status: "clarify",
				message:
					"The no-renewal term is unsupported; manual follow-up needed. Proceed?",
				actions: [],
				unsupported_obligations: [
					{
						obligation: "No automatic renewal",
						reason: "No end-of-term field",
					},
				],
			},
			proposal([attach]),
		],
	});
	await run.send("Provision the signed order form.");
	await run.send("Yes, proceed.");
	expect(run.hasPendingApproval()).toBe(true);
	expect(
		(run.verifications.at(-1)?.evidence as { disclosedObligations?: unknown[] })
			.disclosedObligations,
	).toMatchObject([{ obligation: "No automatic renewal", messageIndex: 1 }]);
});
