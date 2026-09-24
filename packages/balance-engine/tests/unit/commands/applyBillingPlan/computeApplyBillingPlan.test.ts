import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	type ApplyBillingPlanCommand,
	applyMutation,
	computeApplyBillingPlan,
	parseApplyBillingPlanRequest,
	planInsertsCustomer,
	StaleMutationError,
	type SubjectState,
	SubjectStateMissingError,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
} from "../../engineFixtures.js";

const customer = {
	internal_id: "cus_internal_1",
	id: identity.customerId,
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	usage_alerts: null,
	processor: null,
};

const customerProduct = {
	...createCustomerProduct(),
	subscription_ids: ["sub_old"],
	scheduled_ids: ["sched_old"],
};

const commandOf = ({
	ops,
}: {
	ops: ApplyBillingPlanCommand["ops"];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_1",
	requestId: "req_plan_1",
	identity,
	occurredAt: 1_700_000_000_000,
	entityIds: [],
	ops,
	expiringPooledBalanceIds: [],
});

const createPlan = commandOf({
	ops: [
		{ op: "insert", table: "customer", row: customer },
		{ op: "insert", table: "customerProducts", row: customerProduct },
		{
			op: "insert",
			table: "customerEntitlements",
			row: createCustomerEntitlement(),
		},
	],
});

const createdState = (): SubjectState =>
	applyMutation({
		state: null,
		mutation: computeApplyBillingPlan({ command: createPlan, state: null }),
	});

const customerProductId = customerProduct.id;

describe("computeApplyBillingPlan", () => {
	test("the plan's inserts are the mutation's changes, and a plan inserting the customer starts the subject", () => {
		const mutation = computeApplyBillingPlan({
			command: createPlan,
			state: null,
		});
		expect(mutation.revision).toEqual({ before: 0, after: 1 });
		const changes: unknown[] = mutation.changes;
		expect(changes).toEqual(createPlan.ops);
		expect(mutation.result).toEqual({ type: "applyBillingPlan" });

		const state = applyMutation({ state: null, mutation });
		expect(state.revision).toBe(1);
		expect(state.customer).toEqual(customer);
		expect(state.customerProducts).toEqual([customerProduct]);
		expect(state.customerEntitlements).toEqual([createCustomerEntitlement()]);
	});

	test("inserting the customer anywhere but the start of its log is refused", () => {
		const existing = { ...createdState(), revision: 3 };
		expect(() =>
			computeApplyBillingPlan({ command: createPlan, state: existing }),
		).toThrow("must start at revision zero");
	});

	test("a plan that inserts no customer cannot start a subject", () => {
		const productsOnly = commandOf({
			ops: [
				{
					op: "insert",
					table: "customerProducts",
					row: createCustomerProduct(),
				},
			],
		});
		const mutation = computeApplyBillingPlan({
			command: productsOnly,
			state: null,
		});
		expect(() => applyMutation({ state: null, mutation })).toThrow(
			SubjectStateMissingError,
		);
	});

	test("only a plan with a customer insert creates the customer", () => {
		expect(planInsertsCustomer({ command: createPlan })).toBe(true);
		expect(
			planInsertsCustomer({
				command: commandOf({
					ops: [
						{
							op: "insert",
							table: "customerProducts",
							row: createCustomerProduct(),
						},
					],
				}),
			}),
		).toBe(false);
	});

	test("an update is guarded by the columns it sets, as the subject holds them", () => {
		const state = createdState();
		const linkBack = commandOf({
			ops: [
				{
					op: "update",
					table: "customer",
					id: customer.internal_id,
					set: { processor: { id: "cus_stripe_1", type: "stripe" } },
				},
				{
					op: "update",
					table: "customerProducts",
					id: customerProductId,
					set: { subscription_ids: ["sub_1"], scheduled_ids: [] },
				},
			],
		});
		const mutation = computeApplyBillingPlan({ command: linkBack, state });

		expect(mutation.revision).toEqual({ before: 1, after: 2 });
		expect(mutation.changes).toEqual([
			{
				table: "customer",
				op: "update",
				id: customer.internal_id,
				before: { processor: null },
				after: { processor: { id: "cus_stripe_1", type: "stripe" } },
			},
			{
				table: "customerProducts",
				op: "update",
				id: customerProductId,
				before: { subscription_ids: ["sub_old"], scheduled_ids: ["sched_old"] },
				after: { subscription_ids: ["sub_1"], scheduled_ids: [] },
			},
		]);

		const next = applyMutation({ state, mutation });
		expect(next.customer.processor).toEqual({
			id: "cus_stripe_1",
			type: "stripe",
		});
		expect(next.customerProducts[0]?.subscription_ids).toEqual(["sub_1"]);
		expect(planInsertsCustomer({ command: linkBack })).toBe(false);
	});

	test("a column the subject was logged without is not guarded", () => {
		const mutation = computeApplyBillingPlan({
			command: commandOf({
				ops: [
					{
						op: "update",
						table: "customer",
						id: customer.internal_id,
						set: { name: "Ada" },
					},
				],
			}),
			state: createdState(),
		});
		expect(mutation.changes).toEqual([
			{
				table: "customer",
				op: "update",
				id: customer.internal_id,
				before: {},
				after: { name: "Ada" },
			},
		]);
	});

	test("an update of a row the subject does not hold is stale", () => {
		const state = createdState();
		const missingProduct = commandOf({
			ops: [
				{
					op: "update",
					table: "customerProducts",
					id: "cp_missing",
					set: { status: CusProductStatus.Expired },
				},
			],
		});
		const otherCustomer = commandOf({
			ops: [
				{
					op: "update",
					table: "customer",
					id: "cus_internal_other",
					set: { name: "Ada" },
				},
			],
		});
		expect(() =>
			computeApplyBillingPlan({ command: missingProduct, state }),
		).toThrow(StaleMutationError);
		expect(() =>
			computeApplyBillingPlan({ command: otherCustomer, state }),
		).toThrow(StaleMutationError);
		expect(() =>
			computeApplyBillingPlan({ command: otherCustomer, state: null }),
		).toThrow(StaleMutationError);
	});

	test("an update must set a column, and never the row's key", () => {
		const requestWith = (ops: unknown[]) => () =>
			parseApplyBillingPlanRequest({
				input: { command: { ...createPlan, ops }, catalogRows: [] },
			});
		expect(
			requestWith([
				{ op: "update", table: "customer", id: customer.internal_id, set: {} },
			]),
		).toThrow("An update sets no columns");
		expect(
			requestWith([
				{
					op: "update",
					table: "customer",
					id: customer.internal_id,
					set: { internal_id: "cus_internal_2" },
				},
			]),
		).toThrow();
		expect(
			requestWith([
				{
					op: "update",
					table: "customerProducts",
					id: customerProductId,
					set: { id: "cp_2" },
				},
			]),
		).toThrow();
	});
});
