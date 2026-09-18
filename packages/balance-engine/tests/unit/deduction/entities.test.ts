import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import type {
	Catalog,
	SubjectState,
	WorkerCustomer,
	WorkerCustomerEntitlement,
	WorkerEntity,
	WorkerRollover,
} from "../../../src/balanceEngine.js";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import type { DeductionRequest } from "../../../src/deduction/types/deductionRequest.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	entity,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import { customerWith } from "./deductionFixtures.js";

const ENTITY_FEATURE_ID = "seats";
const OTHER_ENTITY_ID = "ent_07";

/** A customer-level row whose balance lives per entity, as `createEntityForCusProduct` seeds it. */
const createEntityMapRow = ({
	id = "messages_per_entity",
	balances = { [OTHER_ENTITY_ID]: 10, [entity.id]: 10 },
	adjustments = {},
}: {
	id?: string;
	balances?: Record<string, number>;
	adjustments?: Record<string, number>;
} = {}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id }),
	balance: 0,
	entities: Object.fromEntries(
		Object.entries(balances).map(([entityId, balance]) => [
			entityId,
			{ id: entityId, balance, adjustment: adjustments[entityId] ?? 0 },
		]),
	),
});

/** The catalog with the map rows' entitlements marked per entity, as the Lua `has_entity_scope` reads it. */
const createEntityCatalogFor = ({
	state,
	entitlementIds,
}: {
	state: SubjectState;
	entitlementIds: string[];
}): Catalog => {
	const catalog = createCatalogFor({ state });
	for (const entitlement of Object.values(catalog.entitlements)) {
		if (entitlementIds.includes(entitlement.id))
			entitlement.entity_feature_id = ENTITY_FEATURE_ID;
	}
	return catalog;
};

const createRequest = ({
	value,
	overageBehavior = "cap",
}: Pick<DeductionRequest, "value"> &
	Partial<Pick<DeductionRequest, "overageBehavior">>): DeductionRequest => ({
	featureId: "messages",
	internalFeatureId: "feat_messages",
	value,
	overageBehavior,
	properties: null,
	enforceOverdueBlock: false,
	now: occurredAt,
	org,
});

const deductFrom = ({
	customer,
	customerEntitlements,
	rollovers = [],
	entityId = null,
	entityRow = entity,
	value,
	overageBehavior,
	perEntityIds = customerEntitlements.map((row) => row.entitlement_id),
}: {
	customer?: WorkerCustomer;
	customerEntitlements: WorkerCustomerEntitlement[];
	rollovers?: WorkerRollover[];
	entityId?: string | null;
	entityRow?: WorkerEntity;
	value: number;
	overageBehavior?: DeductionRequest["overageBehavior"];
	perEntityIds?: string[];
}) => {
	const state = createSubjectState({
		identity: { ...identity, entityId },
		customer,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		rollovers,
		entity: entityId === null ? null : entityRow,
	});
	const catalog = createEntityCatalogFor({
		state,
		entitlementIds: perEntityIds,
	});
	return deduct({
		fullSubject: subjectStateToFullSubject({ state, catalog, entityId }),
		request: createRequest({ value, overageBehavior }),
	});
};

const changesAfter = (outcome: ReturnType<typeof deduct>) =>
	outcome.changes.map((change) =>
		change.op === "update" ? [change.id, change.after] : change,
	);

describe("per-entity balances", () => {
	test.concurrent(
		"an entity view draws its own key and leaves the other entity untouched",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createEntityMapRow()],
				entityId: entity.id,
				value: 4,
			});

			expect(outcome).toMatchObject({ appliedValue: 4, remaining: 0 });
			expect(outcome.deltas).toEqual([
				expect.objectContaining({
					id: "messages_per_entity",
					entityKey: entity.id,
					balanceDelta: -4,
				}),
			]);
			expect(changesAfter(outcome)).toEqual([
				[
					"messages_per_entity",
					{
						entities: {
							[OTHER_ENTITY_ID]: {
								id: OTHER_ENTITY_ID,
								balance: 10,
								adjustment: 0,
							},
							[entity.id]: { id: entity.id, balance: 6, adjustment: 0 },
						},
					},
				],
			]);
		},
	);

	test.concurrent(
		"a customer-level track drains every entity in key order",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createEntityMapRow()],
				value: 15,
			});

			expect(outcome).toMatchObject({ appliedValue: 15, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [delta.entityKey, delta.balanceDelta]),
			).toEqual([
				[OTHER_ENTITY_ID, -10],
				[entity.id, -5],
			]);
			expect(changesAfter(outcome)).toEqual([
				[
					"messages_per_entity",
					{
						entities: {
							[OTHER_ENTITY_ID]: {
								id: OTHER_ENTITY_ID,
								balance: 0,
								adjustment: 0,
							},
							[entity.id]: { id: entity.id, balance: 5, adjustment: 0 },
						},
					},
				],
			]);
		},
	);

	test.concurrent(
		"a refund lifts an entity only to its own grant plus adjustment",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					createEntityMapRow({
						balances: { [entity.id]: 995 },
						adjustments: { [entity.id]: 2 },
					}),
				],
				entityId: entity.id,
				value: -20,
			});

			// grant 1000 + entity adjustment 2 = 1002 ceiling
			expect(outcome).toMatchObject({ appliedValue: -7, remaining: -13 });
			expect(changesAfter(outcome)).toEqual([
				[
					"messages_per_entity",
					{
						entities: {
							[entity.id]: { id: entity.id, balance: 1002, adjustment: 2 },
						},
					},
				],
			]);
		},
	);

	test.concurrent(
		"a rollover holds a balance per entity and drains the target's first",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createEntityMapRow()],
				rollovers: [
					{
						id: "ro_1",
						cus_ent_id: "messages_per_entity",
						balance: 0,
						usage: 0,
						expires_at: null,
						entities: {
							[OTHER_ENTITY_ID]: { id: OTHER_ENTITY_ID, balance: 5, usage: 0 },
							[entity.id]: { id: entity.id, balance: 3, usage: 1 },
						},
					},
				],
				entityId: entity.id,
				value: 5,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [
					delta.table,
					delta.entityKey,
					delta.balanceDelta,
				]),
			).toEqual([
				["rollovers", entity.id, -3],
				["customerEntitlements", entity.id, -2],
			]);
			expect(changesAfter(outcome)).toEqual([
				[
					"messages_per_entity",
					{
						entities: {
							[OTHER_ENTITY_ID]: {
								id: OTHER_ENTITY_ID,
								balance: 10,
								adjustment: 0,
							},
							[entity.id]: { id: entity.id, balance: 8, adjustment: 0 },
						},
					},
				],
				[
					"ro_1",
					{
						entities: {
							[OTHER_ENTITY_ID]: { id: OTHER_ENTITY_ID, balance: 5, usage: 0 },
							[entity.id]: { id: entity.id, balance: 0, usage: 4 },
						},
					},
				],
			]);
		},
	);

	test.concurrent(
		"an unlimited per-entity row absorbs the target entity's usage",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [{ ...createEntityMapRow(), unlimited: true }],
				entityId: entity.id,
				value: 25,
				overageBehavior: "reject",
			});

			expect(outcome).toMatchObject({
				appliedValue: 25,
				remaining: 0,
				rejected: false,
			});
			expect(changesAfter(outcome)).toEqual([
				[
					"messages_per_entity",
					{
						entities: {
							[OTHER_ENTITY_ID]: {
								id: OTHER_ENTITY_ID,
								balance: 10,
								adjustment: 0,
							},
							[entity.id]: { id: entity.id, balance: -15, adjustment: 0 },
						},
					},
				],
			]);
		},
	);

	test.concurrent(
		"an entity view admits a per-entity map row and the entity's own row alike, in the shared order",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					createEntityMapRow(),
					{
						...createCustomerEntitlement({ id: "messages_ent_42", balance: 3 }),
						internal_entity_id: entity.internal_id,
					},
				],
				entityId: entity.id,
				value: 12,
				perEntityIds: ["ent_messages_per_entity"],
			});

			expect(outcome).toMatchObject({ appliedValue: 12, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [
					delta.id,
					delta.entityKey,
					delta.balanceDelta,
				]),
			).toEqual([
				["messages_per_entity", entity.id, -10],
				["messages_ent_42", null, -2],
			]);
		},
	);

	test.concurrent(
		"a customer-level unlimited map row absorbs everything into its first key",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [{ ...createEntityMapRow(), unlimited: true }],
				value: 25,
			});

			expect(outcome).toMatchObject({ appliedValue: 25, remaining: 0 });
			expect(changesAfter(outcome)).toEqual([
				[
					"messages_per_entity",
					{
						entities: {
							[OTHER_ENTITY_ID]: {
								id: OTHER_ENTITY_ID,
								balance: -15,
								adjustment: 0,
							},
							[entity.id]: { id: entity.id, balance: 10, adjustment: 0 },
						},
					},
				],
			]);
		},
	);

	test.concurrent(
		"a customer spend limit is each entity's own budget in its view, and the shared budget at customer level",
		() => {
			const customer = customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 5 },
				],
			});
			const rows = [
				{
					...createEntityMapRow({
						balances: { [OTHER_ENTITY_ID]: -5, [entity.id]: 0 },
					}),
					usage_allowed: true,
				},
			];

			// The other entity's overdraft does not count against this entity's view.
			const entityView = deductFrom({
				customer,
				customerEntitlements: rows,
				entityId: entity.id,
				value: 10,
			});
			expect(entityView).toMatchObject({ appliedValue: 5, remaining: 5 });

			// At customer level every key's overdraft counts, and the budget is spent.
			const customerLevel = deductFrom({
				customer,
				customerEntitlements: rows,
				value: 10,
			});
			expect(customerLevel).toMatchObject({ appliedValue: 0, remaining: 10 });
		},
	);

	test.concurrent(
		"an entity's own usage cap counts on an entity-scoped counter",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createEntityMapRow()],
				entityId: entity.id,
				entityRow: {
					...entity,
					usage_limits: [
						{
							feature_id: "messages",
							enabled: true,
							limit: 3,
							interval: ResetInterval.Day,
						},
					],
				},
				value: 5,
			});

			expect(outcome).toMatchObject({ appliedValue: 3, remaining: 2 });
			expect(
				outcome.changes.filter((change) => change.table === "usageWindows"),
			).toEqual([
				expect.objectContaining({
					op: "insert",
					row: expect.objectContaining({
						internal_entity_id: entity.internal_id,
						usage: 3,
					}),
				}),
			]);
		},
	);
});
