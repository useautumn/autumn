import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	applyMutation,
	computeApplyBillingPlan,
	createSubjectState,
	mergeCustomerAndEntities,
	splitCustomerAndEntities,
	UnsupportedCommandError,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createEntityState,
	createState,
	entity,
	identity,
} from "../../engineFixtures.js";

const otherEntity = {
	...entity,
	id: "ent_43",
	internal_id: "ent_internal_43",
} as const;

const otherEntityState = () =>
	createSubjectState({
		identity: { ...identity, entityId: otherEntity.id },
		customerEntitlements: [
			{
				...createCustomerEntitlement({
					id: "seats_ent_43",
					featureId: "seats",
				}),
				internal_entity_id: otherEntity.internal_id,
			},
		],
		entity: otherEntity,
	});

const customer = () => ({
	...createState(),
	customer: { ...createState().customer, name: "Ada" },
});

const entityProduct = {
	...createCustomerProduct(),
	id: "cp_ent_42",
	internal_entity_id: entity.internal_id,
};

const planOf = ({
	ops,
	entityIds = [entity.id],
}: {
	ops: ApplyBillingPlanCommand["ops"];
	entityIds?: string[];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_entities",
	requestId: "req_plan_entities",
	identity,
	occurredAt: 1_700_000_000_000,
	entityIds,
	ops,
	expiringPooledBalanceIds: [],
});

describe("a billing plan across the customer and its entities", () => {
	test("merging then splitting gives every owner back its own rows", () => {
		const entities = [createEntityState(), otherEntityState()];
		const view = mergeCustomerAndEntities({ customer: customer(), entities });
		expect(view.customerEntitlements).toHaveLength(3);

		const parts = splitCustomerAndEntities({
			state: view,
			entities: [entity, otherEntity],
		});
		expect(parts.customer).toEqual(customer());
		expect(parts.entities.map((part) => part.customerEntitlements)).toEqual(
			entities.map((part) => part.customerEntitlements),
		);
		expect(parts.entities.map((part) => part.identity.entityId)).toEqual([
			entity.id,
			otherEntity.id,
		]);
	});

	test("one mutation changes the customer and an entity; each owner's part holds its own change", () => {
		const view = mergeCustomerAndEntities({
			customer: customer(),
			entities: [createEntityState()],
		});
		const mutation = computeApplyBillingPlan({
			command: planOf({
				ops: [
					{
						op: "update",
						table: "customer",
						id: view.customer.internal_id,
						set: { name: "Grace" },
					},
					{ op: "insert", table: "customerProducts", row: entityProduct },
					{
						op: "insert",
						table: "customerEntitlements",
						row: {
							...createCustomerEntitlement({ id: "api_ent_42" }),
							customer_product_id: entityProduct.id,
							internal_entity_id: entity.internal_id,
						},
					},
				],
			}),
			state: view,
			entities: [entity],
		});
		expect(mutation.identity.entityId).toBeNull();

		const parts = splitCustomerAndEntities({
			state: applyMutation({ state: view, mutation }),
			entities: [entity],
		});
		expect(parts.customer.customer.name).toBe("Grace");
		expect(parts.customer.customerProducts.map((row) => row.id)).toEqual([
			"cp_1",
		]);
		const [entityPart] = parts.entities;
		expect(entityPart?.customerProducts.map((row) => row.id)).toEqual([
			"cp_ent_42",
		]);
		expect(entityPart?.customerEntitlements.map((row) => row.id)).toEqual([
			"seats_ent_42",
			"api_ent_42",
		]);
		expect(entityPart?.revision).toBe(mutation.revision.after);
	});

	test("a row for an entity the plan does not name is refused before anything is written", () => {
		const view = mergeCustomerAndEntities({
			customer: customer(),
			entities: [],
		});
		const refusal = (() => {
			try {
				computeApplyBillingPlan({
					command: planOf({
						entityIds: [],
						ops: [
							{ op: "insert", table: "customerProducts", row: entityProduct },
						],
					}),
					state: view,
				});
			} catch (error) {
				return error;
			}
		})();
		expect(refusal).toBeInstanceOf(UnsupportedCommandError);
		expect(refusal).toMatchObject({
			reason: "billing_plan_row_owner_not_named",
		});
	});

	test("a price for a product neither held nor inserted is refused", () => {
		expect(() =>
			computeApplyBillingPlan({
				command: planOf({
					ops: [
						{
							op: "insert",
							table: "customerPrices",
							row: {
								id: "cpr_1",
								customer_product_id: "cp_unknown",
								price_id: "price_1",
								internal_customer_id: "cus_internal_1",
								created_at: 1_700_000_000_000,
							},
						},
					],
				}),
				state: customer(),
				entities: [entity],
			}),
		).toThrow(UnsupportedCommandError);
	});
});
