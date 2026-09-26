import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	applyBillingPlanToSubjects,
	createSubjectState,
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

const createdEntity = {
	id: "ent_new",
	internal_id: "ent_internal_new",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
} as const;

const otherEntity = {
	...entity,
	id: "ent_43",
	internal_id: "ent_internal_43",
} as const;

const otherEntityPart = () => ({
	state: createSubjectState({
		identity: { ...identity, entityId: otherEntity.id },
		entity: otherEntity,
	}),
	entity: otherEntity,
});

const entityPart = () => ({ state: createEntityState(), entity });

const productOn = ({
	id,
	internalEntityId,
}: {
	id: string;
	internalEntityId: string | null;
}) => ({
	...createCustomerProduct(),
	id,
	internal_entity_id: internalEntityId,
});

const planOf = ({
	ops,
	entityIds,
}: {
	ops: ApplyBillingPlanCommand["ops"];
	entityIds: string[];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_subjects",
	requestId: "req_plan_subjects",
	identity,
	occurredAt: 1_700_000_000_000,
	entityIds,
	ops,
	expiringPooledBalanceIds: [],
});

const refusalOf = (run: () => unknown): unknown => {
	try {
		run();
	} catch (error) {
		return error;
	}
	return null;
};

describe("applyBillingPlanToSubjects", () => {
	test("an entity the plan creates gets its own part, holding the entity and the rows provisioned on it", () => {
		const { projectedStates, nextState } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [createdEntity.id],
				ops: [
					{ op: "insert", table: "entity", row: createdEntity },
					{
						op: "insert",
						table: "customerProducts",
						row: productOn({
							id: "cp_new",
							internalEntityId: createdEntity.internal_id,
						}),
					},
				],
			}),
			customer: createState(),
			entityParts: [],
		});

		const [customerPart, createdPart] = projectedStates;
		expect(projectedStates).toHaveLength(2);
		expect(createdPart?.identity).toEqual({
			...identity,
			entityId: createdEntity.id,
		});
		expect(createdPart?.entity).toEqual(createdEntity);
		expect(createdPart?.customerProducts.map(({ id }) => id)).toEqual([
			"cp_new",
		]);
		expect(customerPart?.entity).toBeNull();
		expect(customerPart?.customerProducts.map(({ id }) => id)).toEqual([
			"cp_1",
		]);
		expect(nextState.revision).toBe(1);
		expect(projectedStates.map(({ revision }) => revision)).toEqual([1, 1]);
	});

	test("a plan that creates the customer and an entity starts both parts from nothing", () => {
		const { projectedStates } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [createdEntity.id],
				ops: [
					{
						op: "insert",
						table: "customer",
						row: createState().customer,
					},
					{ op: "insert", table: "entity", row: createdEntity },
					{
						op: "insert",
						table: "customerEntitlements",
						row: {
							...createCustomerEntitlement({ id: "seats_new" }),
							customer_product_id: null,
							internal_entity_id: createdEntity.internal_id,
						},
					},
				],
			}),
			customer: null,
			entityParts: [],
		});

		const [customerPart, createdPart] = projectedStates;
		expect(customerPart?.customer).toEqual(createState().customer);
		expect(customerPart?.customerEntitlements).toEqual([]);
		expect(createdPart?.customerEntitlements.map(({ id }) => id)).toEqual([
			"seats_new",
		]);
	});

	test("a customer product inserted without internal_entity_id stays in the customer's part", () => {
		const { internal_entity_id: _absent, ...customerLevelProduct } = productOn({
			id: "cp_created",
			internalEntityId: null,
		});
		const { projectedStates } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [],
				ops: [
					{ op: "insert", table: "customer", row: createState().customer },
					{
						op: "insert",
						table: "customerProducts",
						row: customerLevelProduct,
					},
					{
						op: "insert",
						table: "customerEntitlements",
						row: {
							...createCustomerEntitlement({ id: "messages_created" }),
							customer_product_id: "cp_created",
						},
					},
				],
			}),
			customer: null,
			entityParts: [],
		});

		const [customerPart] = projectedStates;
		expect(customerPart?.customerProducts.map(({ id }) => id)).toEqual([
			"cp_created",
		]);
		expect(customerPart?.customerEntitlements.map(({ id }) => id)).toEqual([
			"messages_created",
		]);
	});

	test("an entity the plan creates but does not name gets no part, so its rows are refused", () => {
		const createsUnnamed = (ops: ApplyBillingPlanCommand["ops"]) =>
			refusalOf(() =>
				applyBillingPlanToSubjects({
					command: planOf({ entityIds: [], ops }),
					customer: createState(),
					entityParts: [],
				}),
			);

		const entityOnly = createsUnnamed([
			{ op: "insert", table: "entity", row: createdEntity },
		]);
		expect(entityOnly).toBeInstanceOf(UnsupportedCommandError);
		expect(entityOnly).toMatchObject({
			reason: "billing_plan_row_owner_not_named",
		});

		const withProduct = createsUnnamed([
			{ op: "insert", table: "entity", row: createdEntity },
			{
				op: "insert",
				table: "customerProducts",
				row: productOn({
					id: "cp_new",
					internalEntityId: createdEntity.internal_id,
				}),
			},
		]);
		expect(withProduct).toMatchObject({
			reason: "billing_plan_row_owner_not_named",
		});
	});

	test("projected states come customer first, then each existing part in order, then each created one", () => {
		const { projectedStates } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [createdEntity.id, entity.id, otherEntity.id],
				ops: [{ op: "insert", table: "entity", row: createdEntity }],
			}),
			customer: createState(),
			entityParts: [otherEntityPart(), entityPart()],
		});
		expect(projectedStates.map(({ identity }) => identity.entityId)).toEqual([
			null,
			otherEntity.id,
			entity.id,
			createdEntity.id,
		]);
	});

	test("rows an existing entity holds are in the view: an update of its grant lands in its part only", () => {
		const { projectedStates, nextState } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [entity.id],
				ops: [
					{
						op: "update",
						table: "customerEntitlements",
						id: "seats_ent_42",
						set: { balance: 3 },
					},
				],
			}),
			customer: createState(),
			entityParts: [entityPart()],
		});

		const [customerPart, entityState] = projectedStates;
		expect(entityState?.customerEntitlements).toEqual([
			{
				...createCustomerEntitlement({
					id: "seats_ent_42",
					featureId: "seats",
				}),
				internal_entity_id: entity.internal_id,
				balance: 3,
			},
		]);
		expect(customerPart?.customerEntitlements).toEqual(
			createState().customerEntitlements,
		);
		expect(nextState.customerEntitlements.map(({ id }) => id)).toEqual([
			"messages_monthly",
			"seats_ent_42",
		]);
	});

	test("the mutation is the plan as one change list over every owner", () => {
		const { mutation } = applyBillingPlanToSubjects({
			command: planOf({
				entityIds: [entity.id],
				ops: [
					{
						op: "increment",
						table: "customerEntitlements",
						id: "seats_ent_42",
						add: { balance: 2 },
					},
					{
						op: "increment",
						table: "customerEntitlements",
						id: "messages_monthly",
						add: { balance: -1 },
					},
				],
			}),
			customer: createState(),
			entityParts: [entityPart()],
		});
		expect(mutation.identity).toEqual(identity);
		expect(mutation.revision).toEqual({ before: 0, after: 1 });
		expect(
			mutation.changes.map((change) => ("id" in change ? change.id : null)),
		).toEqual(["seats_ent_42", "messages_monthly"]);
	});
});
