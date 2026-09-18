import { expect, test } from "bun:test";
import type { ToolCall } from "../lib/context.js";
import { resolveRequestIdentities } from "../lib/requestIdentities.js";

const subscription = {
	id: "sub-pro",
	plan_id: "pro",
	status: "active",
	scope: "customer",
	plan: { price: { amount: 49, interval: "month" } },
};
const customer = (subscriptions: unknown[] = [subscription]) => ({
	name: "getCustomer",
	args: { request: { customer_id: "customer" } },
	result: { id: "customer", subscriptions },
});
const entity = (
	subscriptions: unknown[] = [{ ...subscription, scope: "entity" }],
) => ({
	name: "getEntity",
	args: { request: { customer_id: "customer", entity_id: "workspace" } },
	result: { id: "workspace", customer_id: "customer", subscriptions },
});
const action = (
	request: Record<string, unknown>,
	name = "updateSubscription",
): ToolCall => ({
	name,
	args: {
		request: { customer_id: "customer", ...request },
		intent: "Apply the requested change",
	},
});
const resolve = ({
	request,
	details = [customer()],
	name = "updateSubscription",
	facts = {},
}: {
	request: Record<string, unknown>;
	details?: unknown[];
	name?: string;
	facts?: unknown;
}) =>
	resolveRequestIdentities({
		actions: [action(request, name)],
		evidence: { details, facts },
	})[0];

test("subscription identity resolves to the observed plan without mutating input", () => {
	const original = action({
		subscription_id: "sub-pro",
		cancel_action: "cancel_immediately",
	});
	const result = resolveRequestIdentities({
		actions: [original],
		evidence: { details: [customer()] },
	});
	expect(result[0]?.args.request).toMatchObject({
		subscription_id: "sub-pro",
		plan_id: "pro",
	});
	expect(original.args.request).not.toHaveProperty("plan_id");
});

test("a plan-only update is legitimate only with one observed matching subscription", () => {
	expect(resolve({ request: { plan_id: "pro" } })?.args.request).toMatchObject({
		plan_id: "pro",
	});
	expect(() => resolve({ request: { plan_id: "pro" }, details: [] })).toThrow(
		"exactly one observed subscription",
	);
	expect(() =>
		resolve({
			request: { plan_id: "pro" },
			details: [],
			facts: { listCustomers: { list: [{ id: "customer" }] } },
		}),
	).toThrow("exactly one observed subscription");
});

test("mismatched subscription and plan identities are rejected", () => {
	expect(() =>
		resolve({ request: { subscription_id: "sub-pro", plan_id: "other" } }),
	).toThrow("different subscriptions");
	expect(() =>
		resolve({ request: { subscription_id: "missing", plan_id: "pro" } }),
	).toThrow("exactly one observed subscription");
});

test("duplicate plan subscriptions require explicit subscription identity", () => {
	const details = [
		customer([subscription, { ...subscription, id: "sub-second" }]),
	];
	expect(() => resolve({ request: { plan_id: "pro" }, details })).toThrow(
		"exactly one observed subscription",
	);
	expect(
		resolve({
			request: { subscription_id: "sub-second", plan_id: "pro" },
			details,
		})?.args.request,
	).toMatchObject({ subscription_id: "sub-second", plan_id: "pro" });
	expect(() =>
		resolve({
			request: { subscription_id: "sub-pro" },
			details: [customer([subscription, subscription])],
		}),
	).toThrow("exactly one observed subscription");
});

test("the internal highest-precedence selector cannot bypass observed identities", () => {
	expect(() =>
		resolve({
			request: {
				subscription_id: "sub-pro",
				customer_product_id: "other-internal-id",
			},
		}),
	).toThrow("cannot override");
});

test("customer and entity reads cannot authorize one another's scope", () => {
	expect(() =>
		resolve({
			request: { entity_id: "workspace", subscription_id: "sub-pro" },
		}),
	).toThrow("exactly one observed subscription");
	expect(() =>
		resolve({ request: { subscription_id: "sub-pro" }, details: [entity()] }),
	).toThrow("exactly one observed subscription");
	expect(
		resolve({
			request: { entity_id: "workspace", subscription_id: "sub-pro" },
			details: [entity()],
		})?.args.request,
	).toMatchObject({ entity_id: "workspace", plan_id: "pro" });
});

test("wrong customer or entity lookup identities are rejected", () => {
	expect(() =>
		resolve({ request: { customer_id: "other", plan_id: "pro" } }),
	).toThrow("exactly one observed subscription");
	expect(() =>
		resolve({
			request: { entity_id: "other", plan_id: "pro" },
			details: [entity()],
		}),
	).toThrow("exactly one observed subscription");
	const wrongLookup = entity();
	wrongLookup.args.request.entity_id = "other";
	expect(() =>
		resolve({
			request: { entity_id: "workspace", plan_id: "pro" },
			details: [wrongLookup],
		}),
	).toThrow("exactly one observed subscription");
	const wrongCustomer = entity();
	wrongCustomer.result.customer_id = "other";
	expect(() =>
		resolve({
			request: { entity_id: "workspace", plan_id: "pro" },
			details: [wrongCustomer],
		}),
	).toThrow("exactly one observed subscription");
});

test("inherited customer subscriptions are not entity-owned updates or duplicate entity attachments", () => {
	const details = [entity([subscription])];
	expect(() =>
		resolve({ request: { entity_id: "workspace", plan_id: "pro" }, details }),
	).toThrow("exactly one observed subscription");
	expect(
		resolve({
			request: { entity_id: "workspace", plan_id: "pro" },
			name: "attach",
			details,
		})?.name,
	).toBe("attach");
	expect(() =>
		resolve({
			request: { plan_id: "pro" },
			details: [customer([{ ...subscription, scope: "entity" }])],
		}),
	).toThrow("exactly one observed subscription");
});

test("expired or missing-state subscriptions cannot prove a current update target", () => {
	for (const status of ["expired", undefined]) {
		expect(() =>
			resolve({
				request: { plan_id: "pro" },
				details: [customer([{ ...subscription, status }])],
			}),
		).toThrow("exactly one observed subscription");
	}
	expect(
		resolve({
			request: { plan_id: "pro" },
			details: [customer([{ ...subscription, status: "scheduled" }])],
		})?.name,
	).toBe("updateSubscription");
});

test("current API past-due and trialing subscriptions remain valid update targets", () => {
	for (const state of [
		{ past_due: true },
		{ trial_ends_at: 1_900_000_000_000 },
	]) {
		expect(
			resolve({
				request: { subscription_id: "sub-pro" },
				details: [customer([{ ...subscription, ...state }])],
			})?.args.request,
		).toMatchObject({ subscription_id: "sub-pro", plan_id: "pro" });
	}
});

test("the newest scoped read replaces stale subscription observations", () => {
	expect(() =>
		resolve({
			request: { plan_id: "pro" },
			details: [customer(), customer([])],
		}),
	).toThrow("exactly one observed subscription");
});

test("unknown customers cannot be updated but observed list identities suffice for metadata", () => {
	expect(() =>
		resolve({
			request: { email: "billing@example.com" },
			name: "updateCustomer",
			details: [],
		}),
	).toThrow("observed existing customer");
	expect(
		resolve({
			request: { email: "billing@example.com" },
			name: "updateCustomer",
			details: [],
			facts: { listCustomers: { list: [{ id: "customer" }] } },
		})?.name,
	).toBe("updateCustomer");
	expect(
		resolve({
			request: { email: "billing@example.com" },
			name: "updateCustomer",
		})?.name,
	).toBe("updateCustomer");
});

test("duplicate recurring attachments are blocked only at their actual scope", () => {
	expect(() =>
		resolve({ request: { plan_id: "pro" }, name: "attach" }),
	).toThrow("already attached");
	expect(() =>
		resolve({
			request: { entity_id: "workspace", plan_id: "pro" },
			name: "attach",
			details: [entity()],
		}),
	).toThrow("already attached");
	expect(resolve({ request: { plan_id: "other" }, name: "attach" })?.name).toBe(
		"attach",
	);
	expect(
		resolve({
			request: { plan_id: "pro" },
			name: "attach",
			details: [customer([{ ...subscription, status: "expired" }])],
		})?.name,
	).toBe("attach");
	expect(() =>
		resolve({
			request: { plan_id: "pro" },
			name: "attach",
			details: [
				customer([
					{ ...subscription, plan: { price: { interval: "one_off" } } },
				]),
			],
		}),
	).toThrow("already attached");
	const purchased = customer([]);
	expect(
		resolve({
			request: { plan_id: "pro" },
			name: "attach",
			details: [
				{
					...purchased,
					result: {
						...purchased.result,
						purchases: [
							{ plan_id: "pro", plan: { price: { interval: "one_off" } } },
						],
					},
				},
			],
		})?.name,
	).toBe("attach");
});

test("missing customer identity is never treated as an observed scope", () => {
	expect(() =>
		resolve({ request: { customer_id: undefined, plan_id: "pro" } }),
	).toThrow("customer identity is required");
});
