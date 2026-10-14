import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	computeApplyBillingPlan,
	createSubjectState,
	StaleMutationError,
	type SubjectState,
	toBillingPlanDeleteOp,
	toBillingPlanInsertOp,
	toBillingPlanUpdateOp,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	testProductInternalId,
} from "../../engineFixtures.js";

const customerRow = {
	internal_id: "cus_internal_1",
	id: identity.customerId,
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	currency: null,
};

const heldState = ({
	rolloverOnGrant = false,
}: {
	rolloverOnGrant?: boolean;
} = {}): SubjectState =>
	createSubjectState({
		identity,
		customer: customerRow,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance: 60 })],
		rollovers: rolloverOnGrant
			? [
					{
						id: "ro_1",
						cus_ent_id: "messages_monthly",
						balance: 25,
						usage: 0,
						expires_at: null,
						entities: {},
					},
				]
			: [],
	});

const planOf = ({
	ops,
}: {
	ops: ApplyBillingPlanCommand["ops"];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_preconditions",
	requestId: "req_plan_preconditions",
	identity,
	occurredAt: 1_700_000_000_000,
	entityIds: [],
	ops,
	expiringPooledBalanceIds: [],
});

const heldProduct = ({
	status = "active",
	internalProductId = testProductInternalId,
	customerPriceIds = [],
}: {
	status?: string;
	internalProductId?: string;
	customerPriceIds?: string[];
} = {}) => ({
	columns: { status, internal_product_id: internalProductId },
	customerPriceIds,
});

const changesOf = ({
	ops,
	state = heldState(),
}: {
	ops: ApplyBillingPlanCommand["ops"];
	state?: SubjectState;
}) =>
	computeApplyBillingPlan({ command: planOf({ ops }), state }).changes.map(
		({ table, op, ...rest }) => `${op}:${table}:${"id" in rest ? rest.id : ""}`,
	);

describe("ops that name what they expect the held row to be", () => {
	test("a delete lands while the grant still holds the expected entitlement", () => {
		expect(
			changesOf({
				ops: [
					toBillingPlanDeleteOp({
						table: "customerEntitlements",
						id: "messages_monthly",
						expect: { entitlement_id: "ent_messages_monthly" },
					}),
				],
			}),
		).toEqual(["delete:customerEntitlements:messages_monthly"]);
	});

	test("a delete of a grant that moved to another entitlement is stale", () => {
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanDeleteOp({
						table: "customerEntitlements",
						id: "messages_monthly",
						expect: { entitlement_id: "ent_messages_200" },
					}),
				],
			}),
		).toThrow(StaleMutationError);
	});

	test("a delete without rollovers is stale once the grant holds one", () => {
		const ops = [
			toBillingPlanDeleteOp({
				table: "customerEntitlements",
				id: "messages_monthly",
				withoutRollovers: true,
			}),
		];
		expect(() =>
			changesOf({ ops, state: heldState({ rolloverOnGrant: true }) }),
		).toThrow(StaleMutationError);
		expect(changesOf({ ops })).toEqual([
			"delete:customerEntitlements:messages_monthly",
		]);
	});

	test("an update of a grant or product that no longer holds the expected columns is stale", () => {
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanUpdateOp({
						table: "customerEntitlements",
						id: "messages_monthly",
						set: { entitlement_id: "ent_messages_200" },
						expect: { entitlement_id: "ent_messages_50" },
					}),
				],
			}),
		).toThrow(StaleMutationError);
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanUpdateOp({
						table: "customerProducts",
						id: "cp_1",
						set: { internal_product_id: "prod_internal_pro_v2" },
						expect: { internal_product_id: "prod_internal_pro_v0" },
					}),
				],
			}),
		).toThrow(StaleMutationError);
	});

	test("a grant insert lands while its product holds exactly the feature grants it names", () => {
		const insert = ({
			expectFeatureGrants,
		}: {
			expectFeatureGrants: Record<string, string>;
		}) =>
			toBillingPlanInsertOp({
				table: "customerEntitlements",
				row: createCustomerEntitlement({ id: "messages_added" }),
				expectFeatureGrants,
			});

		expect(
			changesOf({
				ops: [
					insert({
						expectFeatureGrants: { messages_monthly: "ent_messages_monthly" },
					}),
				],
			}),
		).toEqual(["insert:customerEntitlements:"]);
		expect(() =>
			changesOf({ ops: [insert({ expectFeatureGrants: {} })] }),
		).toThrow(StaleMutationError);
	});

	test("a grant insert is stale once a sibling grant moved to another entitlement in place", () => {
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanInsertOp({
						table: "customerEntitlements",
						row: createCustomerEntitlement({ id: "messages_added" }),
						expectFeatureGrants: { messages_monthly: "ent_messages_yearly" },
					}),
				],
			}),
		).toThrow(StaleMutationError);
	});

	test("a grant insert counts the plan's own earlier deletes and inserts", () => {
		expect(
			changesOf({
				ops: [
					toBillingPlanDeleteOp({
						table: "customerEntitlements",
						id: "messages_monthly",
					}),
					toBillingPlanInsertOp({
						table: "customerEntitlements",
						row: createCustomerEntitlement({ id: "messages_added" }),
						expectFeatureGrants: {},
					}),
				],
			}),
		).toEqual([
			"delete:customerEntitlements:messages_monthly",
			"insert:customerEntitlements:",
		]);
	});

	test("a grant insert onto a product the worker doesn't hold is stale", () => {
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanInsertOp({
						table: "customerEntitlements",
						row: {
							...createCustomerEntitlement({ id: "messages_added" }),
							customer_product_id: "cp_gone",
						},
						expectFeatureGrants: {},
					}),
				],
			}),
		).toThrow(StaleMutationError);
	});

	test("the guards never reach the log", () => {
		const { changes } = computeApplyBillingPlan({
			command: planOf({
				ops: [
					toBillingPlanInsertOp({
						table: "customerEntitlements",
						row: createCustomerEntitlement({ id: "messages_added" }),
						expectFeatureGrants: { messages_monthly: "ent_messages_monthly" },
						expectProduct: heldProduct(),
					}),
				],
			}),
			state: heldState(),
		});
		expect(changes[0]).not.toHaveProperty("expectFeatureGrants");
		expect(changes[0]).not.toHaveProperty("expectProduct");
	});

	test("a grant op lands while its product still holds the version, status and prices SQL read", () => {
		const ops = [
			toBillingPlanDeleteOp({
				table: "customerEntitlements",
				id: "messages_monthly",
				expectProduct: heldProduct(),
			}),
		];
		expect(changesOf({ ops })).toEqual([
			"delete:customerEntitlements:messages_monthly",
		]);
	});

	test("a grant op is stale once its product gained a price, changed status or moved version", () => {
		const staleProducts = [
			heldProduct({ customerPriceIds: ["cus_price_added"] }),
			heldProduct({ status: "expired" }),
			heldProduct({ internalProductId: "prod_internal_pro_v2" }),
		];
		for (const expectProduct of staleProducts) {
			expect(() =>
				changesOf({
					ops: [
						toBillingPlanUpdateOp({
							table: "customerEntitlements",
							id: "messages_monthly",
							set: { entitlement_id: "ent_messages_200" },
							expectProduct,
						}),
					],
				}),
			).toThrow(StaleMutationError);
		}
	});

	test("a product repoint is stale once the product gained a price", () => {
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanUpdateOp({
						table: "customerProducts",
						id: "cp_1",
						set: { internal_product_id: "prod_internal_pro_v2" },
						expectProduct: heldProduct({
							customerPriceIds: ["cus_price_added"],
						}),
					}),
				],
			}),
		).toThrow(StaleMutationError);
	});

	test("an update lands while the held row still holds the expected columns", () => {
		expect(
			changesOf({
				ops: [
					toBillingPlanUpdateOp({
						table: "customerProducts",
						id: "cp_1",
						set: { internal_product_id: "prod_internal_pro_v2" },
						expect: { internal_product_id: testProductInternalId },
					}),
				],
			}),
		).toEqual(["update:customerProducts:cp_1"]);
	});
});
