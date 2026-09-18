import { afterEach, expect, test } from "bun:test";
import type { ToolCall } from "../lib/context.js";
import {
	assertPlanRules,
	verifyOperationPlan,
} from "../lib/verifyOperationPlan.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.TYPESAFE_API_KEY;
const originalReportDir = process.env.LEAF_LAB_REPORT_DIR;
let payload:
	| {
			state: {
				completedActions: unknown[];
				remainingActions: unknown[];
				completeActionSequence: unknown[];
				evidence: Record<string, unknown>;
				calendarDates: unknown[];
				pricedAllowanceRemovals: unknown[];
				pricedAllowanceEquivalence: unknown[];
			};
			questions: Record<string, unknown>;
	  }
	| undefined;

afterEach(() => {
	globalThis.fetch = originalFetch;
	for (const [key, value] of Object.entries({
		TYPESAFE_API_KEY: originalKey,
		LEAF_LAB_REPORT_DIR: originalReportDir,
	})) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	payload = undefined;
});

const mockVerdict = (scores: Record<string, number> = {}) => {
	process.env.TYPESAFE_API_KEY = "test-only";
	delete process.env.LEAF_LAB_REPORT_DIR;
	globalThis.fetch = Object.assign(
		async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as NonNullable<
				typeof payload
			>;
			if ("unrequested_target_change" in body.questions) payload = body;
			return Response.json({
				answers: Object.fromEntries(
					Object.keys(body.questions).map((name) => [
						name,
						{ noul: scores[name] ?? 0 },
					]),
				),
			});
		},
		{ preconnect: originalFetch.preconnect },
	);
};

const verify = ({
	actions,
	evidence = {},
}: {
	actions: ToolCall[];
	evidence?: unknown;
}) =>
	verifyOperationPlan({
		evidence,
		actions,
		onMeasurement: () => {},
		onVerdict: () => {},
	});

const attach: ToolCall = {
	name: "attach",
	args: { request: { customer_id: "customer", plan_id: "pro" } },
};

test("remaining-action verification includes fulfilled actions without proposing them again", async () => {
	mockVerdict();
	const completed = [{ call: attach, result: { success: true } }];
	const cancel: ToolCall = {
		name: "updateSubscription",
		args: {
			request: {
				customer_id: "customer",
				plan_id: "old",
				cancel_action: "cancel_end_of_cycle",
			},
		},
	};
	await verify({
		actions: [cancel],
		evidence: { completed, reads: [{ redundant: true }] },
	});
	expect(payload?.state.completedActions).toEqual(completed);
	expect(payload?.state.remainingActions).toEqual([cancel]);
	expect(payload?.state.completeActionSequence).toEqual([
		{ state: "already executed", call: attach },
		{ state: "not yet executed", call: cancel },
	]);
	expect(payload?.state.evidence.reads).toBeUndefined();
});

test("numeric schedule dates are exposed as exact UTC dates to the semantic verifier", async () => {
	mockVerdict();
	const epochMs = Date.parse("2028-04-01T00:00:00.000Z");
	await verify({
		actions: [
			{
				name: "createSchedule",
				args: { request: { phases: [{ starts_at: epochMs }] } },
			},
		],
	});
	expect(payload?.state.calendarDates).toEqual([
		{
			path: "actions[0].request.phases[0].starts_at",
			epochMs,
			utc: "2028-04-01T00:00:00.000Z",
		},
	]);
});

test("invalid timestamps fail before making a semantic verification call", async () => {
	mockVerdict();
	await expect(
		verify({
			actions: [
				{
					name: "createSchedule",
					args: { request: { phases: [{ starts_at: Infinity }] } },
				},
			],
		}),
	).rejects.toThrow("Invalid timestamp");
	expect(payload).toBeUndefined();
});

test("a semantic failure at the threshold rejects the proposal", async () => {
	mockVerdict({ wrong_target: 0.5 });
	await expect(verify({ actions: [attach] })).rejects.toThrow("wrong_target");
});

test("an exact user-price mismatch fails before any semantic verification request", async () => {
	mockVerdict();
	await expect(
		verify({
			evidence: {
				messages: [{ role: "user", content: "Attach Pro at $1900/month." }],
			},
			actions: [
				{
					...attach,
					args: {
						request: {
							customer_id: "customer",
							plan_id: "pro",
							customize: { price: { amount: 19000, interval: "month" } },
						},
					},
				},
			],
		}),
	).rejects.toThrow("Requested base-price mismatch");
	expect(payload).toBeUndefined();
});

test("matching a literal price never bypasses semantic target validation", async () => {
	mockVerdict({ wrong_target: 0.9 });
	await expect(
		verify({
			evidence: {
				messages: [{ role: "user", content: "Attach Pro at $1900/month." }],
			},
			actions: [
				{
					...attach,
					args: {
						request: {
							customer_id: "wrong-customer",
							plan_id: "pro",
							customize: { price: { amount: 1900, interval: "month" } },
						},
					},
				},
			],
		}),
	).rejects.toThrow("wrong_target");
	expect(payload).toBeDefined();
});

const pricedAllowance = {
	feature_id: "credits",
	included: 100,
	reset: { interval: "month" },
	price: { billing_method: "prepaid", interval: "month", amount: 2 },
};
const allowanceEvidence = {
	facts: {
		listPlans: { list: [{ id: "pro", version: 1, items: [pricedAllowance] }] },
	},
	details: [],
};
const allowanceChange: ToolCall = {
	name: "attach",
	args: {
		request: {
			customer_id: "customer",
			plan_id: "pro",
			customize: {
				remove_items: [{ feature_id: "credits", billing_method: "prepaid" }],
				add_items: [
					{
						feature_id: "credits",
						included: 1000,
						reset: { interval: "month" },
					},
				],
			},
		},
	},
};

test("allowance pricing loss fails closed without strong explicit removal authorization", async () => {
	mockVerdict({ pricing_removal_authorized: 0.89 });
	const before = structuredClone(allowanceChange);
	await expect(
		verify({ actions: [allowanceChange], evidence: allowanceEvidence }),
	).rejects.toThrow("Preserve the existing paid pricing");
	expect(payload?.state.pricedAllowanceRemovals).toHaveLength(1);
	expect(allowanceChange).toEqual(before);
});

test("explicit pricing removal authorization is separate from the reject-score threshold", async () => {
	mockVerdict({ pricing_removal_authorized: 0.9 });
	await expect(
		verify({ actions: [allowanceChange], evidence: allowanceEvidence }),
	).resolves.toMatchObject({ pricing_removal_authorized: 0.9 });
});

test("verification receives source-backed allowance pricing equivalence without rewriting the request", async () => {
	mockVerdict();
	const action = structuredClone(allowanceChange);
	const request = action.args.request as {
		customize: { add_items: Array<Record<string, unknown>> };
	};
	request.customize.add_items[0].price = structuredClone(pricedAllowance.price);
	const before = structuredClone(action);
	await verify({ actions: [action], evidence: allowanceEvidence });
	expect(payload?.state.pricedAllowanceEquivalence).toMatchObject([
		{ sourceIncluded: 100, proposedIncluded: 1000, paidPricePreserved: true },
	]);
	expect(action).toEqual(before);
});

test("a literal user price settles the base-price override question; a fabricated override does not", async () => {
	mockVerdict({ unrequested_base_price: 0.9 });
	await expect(
		verify({
			evidence: {
				messages: [{ role: "user", content: "Attach Pro at $1900/month." }],
			},
			actions: [
				{
					...attach,
					args: {
						request: {
							customer_id: "customer",
							plan_id: "pro",
							customize: { price: { amount: 1900, interval: "month" } },
						},
					},
				},
			],
		}),
	).resolves.toBeDefined();
	mockVerdict({ unrequested_base_price: 0.9 });
	await expect(
		verify({
			evidence: {
				messages: [{ role: "user", content: "Attach Pro with 500 seats." }],
			},
			actions: [
				{
					...attach,
					args: {
						request: {
							customer_id: "customer",
							plan_id: "pro",
							customize: { price: { amount: 1900, interval: "month" } },
						},
					},
				},
			],
		}),
	).rejects.toThrow("unrequested_base_price");
});

test("cancel timing that matches the user's word settles the timing question; a mismatch does not", async () => {
	const cancel = (cancel_action: string): ToolCall => ({
		name: "updateSubscription",
		args: {
			request: { customer_id: "customer", plan_id: "old", cancel_action },
		},
	});
	mockVerdict({ missing_cancel_timing: 0.9 });
	await expect(
		verify({
			evidence: {
				messages: [
					{ role: "user", content: "Cancel the old plan immediately." },
				],
			},
			actions: [cancel("cancel_immediately")],
		}),
	).resolves.toBeDefined();
	mockVerdict({ missing_cancel_timing: 0.9 });
	await expect(
		verify({
			evidence: {
				messages: [
					{ role: "user", content: "Cancel the old plan immediately." },
				],
			},
			actions: [cancel("cancel_end_of_cycle")],
		}),
	).rejects.toThrow("missing_cancel_timing");
});
