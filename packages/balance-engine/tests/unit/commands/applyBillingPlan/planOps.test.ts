import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	applyMutation,
	computeApplyBillingPlan,
	createSubjectState,
	mergeCustomerAndEntities,
	planInsertedEntities,
	StaleMutationError,
	type SubjectState,
	splitCustomerAndEntities,
	toBillingPlanDeleteOp,
	toBillingPlanIncrementOp,
	toBillingPlanInsertOp,
	toBillingPlanMoveEntriesOp,
	toBillingPlanUpdateOp,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
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

/** One product with a price, a grant, and a rollover on that grant. */
const heldState = (): SubjectState =>
	createSubjectState({
		identity,
		customer: customerRow,
		customerProducts: [createCustomerProduct()],
		customerPrices: [
			{
				id: "cpr_1",
				customer_product_id: "cp_1",
				price_id: "price_1",
				internal_customer_id: "cus_internal_1",
				created_at: 1,
			},
		],
		customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
		rollovers: [
			{
				id: "ro_1",
				cus_ent_id: "messages_monthly",
				balance: 3,
				usage: 0,
				expires_at: null,
				entities: {},
			},
		],
	});

const planOf = ({
	ops,
	entityIds = [],
}: {
	ops: ApplyBillingPlanCommand["ops"];
	entityIds?: string[];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_ops",
	requestId: "req_plan_ops",
	identity,
	occurredAt: 1_700_000_000_000,
	entityIds,
	ops,
	expiringPooledBalanceIds: [],
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

describe("a plan's delete, update and increment ops", () => {
	test("deleting a product takes its price, grant and the grant's rollover first, as Postgres cascades", () => {
		const state = heldState();
		const ops = [
			toBillingPlanDeleteOp({ table: "customerProducts", id: "cp_1" }),
		];
		expect(changesOf({ ops, state })).toEqual([
			"delete:customerPrices:cpr_1",
			"delete:rollovers:ro_1",
			"delete:customerEntitlements:messages_monthly",
			"delete:customerProducts:cp_1",
		]);
		const next = applyMutation({
			state,
			mutation: computeApplyBillingPlan({ command: planOf({ ops }), state }),
		});
		expect(next.customerProducts).toEqual([]);
		expect(next.customerPrices).toEqual([]);
		expect(next.customerEntitlements).toEqual([]);
		expect(next.rollovers).toEqual([]);
	});

	test("a row an earlier op already deleted is not deleted, updated or incremented again", () => {
		expect(
			changesOf({
				ops: [
					toBillingPlanDeleteOp({ table: "customerProducts", id: "cp_1" }),
					toBillingPlanDeleteOp({
						table: "customerEntitlements",
						id: "messages_monthly",
					}),
					toBillingPlanUpdateOp({
						table: "customerEntitlements",
						id: "messages_monthly",
						set: { next_reset_at: 5 },
					}),
					toBillingPlanIncrementOp({
						id: "messages_monthly",
						add: { balance: 1 },
					}),
				],
			}),
		).toEqual([
			"delete:customerPrices:cpr_1",
			"delete:rollovers:ro_1",
			"delete:customerEntitlements:messages_monthly",
			"delete:customerProducts:cp_1",
		]);
	});

	test("a delete or update of a row the worker does not hold is stale", () => {
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanDeleteOp({ table: "customerProducts", id: "cp_gone" }),
				],
			}),
		).toThrow(StaleMutationError);
		expect(() =>
			changesOf({
				ops: [
					toBillingPlanUpdateOp({
						table: "customerEntitlements",
						id: "ce_gone",
						set: { adjustment: 1 },
					}),
				],
			}),
		).toThrow(StaleMutationError);
	});

	test("a grant update replaces its columns; an increment adds to whatever the grant holds", () => {
		const state = heldState();
		const ops = [
			toBillingPlanUpdateOp({
				table: "customerEntitlements",
				id: "messages_monthly",
				set: { next_reset_at: 1_800_000_000_000 },
			}),
			toBillingPlanIncrementOp({
				id: "messages_monthly",
				add: { balance: 25 },
			}),
		];
		const next = applyMutation({
			state,
			mutation: computeApplyBillingPlan({ command: planOf({ ops }), state }),
		});
		expect(next.customerEntitlements[0]).toMatchObject({
			next_reset_at: 1_800_000_000_000,
			balance: 35,
		});
	});

	test("a move re-keys the live per-entity entries it finds and leaves the rest", () => {
		const held = {
			...heldState(),
			customerEntitlements: [
				{
					...createCustomerEntitlement({ balance: 10 }),
					entities: {
						rep_1: { id: "rep_1", balance: 120, adjustment: 7 },
						u2: { id: "u2", balance: 500, adjustment: 0 },
					},
				},
			],
		};
		const ops = [
			toBillingPlanMoveEntriesOp({
				id: "messages_monthly",
				moves: { rep_1: "u1", rep_missing: "u3" },
			}),
		];
		const next = applyMutation({
			state: held,
			mutation: computeApplyBillingPlan({
				command: planOf({ ops }),
				state: held,
			}),
		});
		expect(next.customerEntitlements[0]?.entities).toEqual({
			u1: { id: "u1", balance: 120, adjustment: 7 },
			u2: { id: "u2", balance: 500, adjustment: 0 },
		});

		const untouched = computeApplyBillingPlan({
			command: planOf({
				ops: [
					toBillingPlanMoveEntriesOp({
						id: "messages_monthly",
						moves: { rep_missing: "u3" },
					}),
				],
			}),
			state: held,
		});
		expect(untouched.changes).toEqual([]);
	});

	test("a currency lock sets the currency only while the customer has none", () => {
		const lock = [
			toBillingPlanUpdateOp({
				table: "customer",
				id: customerRow.internal_id,
				set: { currency: "usd" },
				whereUnset: true,
			}),
		];
		expect(changesOf({ ops: lock })).toEqual([
			"update:customer:cus_internal_1",
		]);

		const locked = {
			...heldState(),
			customer: { ...customerRow, currency: "eur" },
		};
		expect(changesOf({ ops: lock, state: locked })).toEqual([]);
	});

	test("a plan that creates an entity names it, and the entity's part holds its new row", () => {
		const entity = {
			id: "ent_new",
			internal_id: "ent_internal_new",
			internal_customer_id: "cus_internal_1",
			feature_id: "seats",
			internal_feature_id: "feat_seats",
			org_id: identity.orgId,
			env: identity.env,
			created_at: 1,
			name: "Seat",
			deleted: false,
		};
		const entityProduct = {
			...createCustomerProduct(),
			id: "cp_ent_new",
			internal_entity_id: entity.internal_id,
		};
		const command = planOf({
			entityIds: [entity.id],
			ops: [
				toBillingPlanInsertOp({ table: "entity", row: entity }),
				toBillingPlanInsertOp({
					table: "customerProducts",
					row: entityProduct,
				}),
			],
		});
		const entities = planInsertedEntities({ command });
		expect(entities.map(({ id }) => id)).toEqual(["ent_new"]);

		const view = mergeCustomerAndEntities({
			customer: heldState(),
			entities: [],
		});
		const next = applyMutation({
			state: view,
			mutation: computeApplyBillingPlan({ command, state: view, entities }),
		});
		const parts = splitCustomerAndEntities({ state: next, entities });
		expect(parts.customer.customerProducts.map(({ id }) => id)).toEqual([
			"cp_1",
		]);
		expect(parts.customer.entity).toBeNull();
		expect(parts.entities[0]?.entity?.id).toBe("ent_new");
		expect(parts.entities[0]?.customerProducts.map(({ id }) => id)).toEqual([
			"cp_ent_new",
		]);
	});
});
