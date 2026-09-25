import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeUpdateBalance,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createUpdateBalanceCommand,
	entity,
	identity,
} from "../../engineFixtures.js";

// Mirrors server/tests/integration/balances/update/included/ and update-balance-prepaid-granted.

const ALLOWANCE = 100;
const OTHER_ENTITY = "ent_99";

const update = ({
	customerEntitlements,
	entityId = null,
	perEntity = false,
	includedGrant,
	remaining,
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	entityId?: string | null;
	perEntity?: boolean;
	includedGrant: number;
	remaining?: number;
}): { state: SubjectState; after: SubjectState | null } => {
	const state = createSubjectState({
		identity: { ...identity, entityId },
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		entity: entityId === null ? null : { ...entity, id: entityId },
	});
	const catalog = createCatalogFor({ state });
	for (const entitlement of Object.values(catalog.entitlements)) {
		entitlement.allowance = ALLOWANCE;
		if (perEntity) entitlement.entity_feature_id = "seats";
	}
	const mutation = computeUpdateBalance({
		fullSubject: subjectStateToFullSubject({ state, catalog, entityId }),
		command: createUpdateBalanceCommand({ entityId, includedGrant, remaining }),
	});
	return {
		state,
		after: mutation ? applyMutation({ state, mutation }) : null,
	};
};

const rowAfter = ({ after, id }: { after: SubjectState | null; id: string }) =>
	after?.customerEntitlements.find((row) => row.id === id);

describe("updateBalance: included_grant", () => {
	test("sets the adjustment so allowance plus adjustment is the target; the balance stays", () => {
		const { after } = update({
			customerEntitlements: [
				createCustomerEntitlement({ id: "monthly", balance: 100 }),
			],
			includedGrant: 150,
		});

		expect(rowAfter({ after, id: "monthly" })).toMatchObject({
			adjustment: 50,
			balance: 100,
		});
	});

	test("replaces an existing adjustment rather than adding to it", () => {
		const { after } = update({
			customerEntitlements: [
				{
					...createCustomerEntitlement({ id: "monthly", balance: 120 }),
					adjustment: 20,
				},
			],
			includedGrant: 75,
		});

		expect(rowAfter({ after, id: "monthly" })).toMatchObject({
			adjustment: -25,
			balance: 120,
		});
	});

	test("with a target balance, both land on the same row in one mutation", () => {
		const { after } = update({
			customerEntitlements: [
				createCustomerEntitlement({ id: "monthly", balance: 100 }),
			],
			includedGrant: 150,
			remaining: 100,
		});

		expect(rowAfter({ after, id: "monthly" })).toMatchObject({
			adjustment: 50,
			balance: 100,
		});

		const lowered = update({
			customerEntitlements: [
				createCustomerEntitlement({ id: "monthly", balance: 100 }),
			],
			includedGrant: 75,
			remaining: 50,
		});
		expect(rowAfter({ after: lowered.after, id: "monthly" })).toMatchObject({
			adjustment: -25,
			balance: 50,
		});
	});

	test("an entity's grant moves only that entity's adjustment", () => {
		const { after } = update({
			customerEntitlements: [
				{
					...createCustomerEntitlement({ id: "per_entity" }),
					balance: 0,
					entities: {
						[entity.id]: { id: entity.id, balance: 100, adjustment: 0 },
						[OTHER_ENTITY]: { id: OTHER_ENTITY, balance: 100, adjustment: 0 },
					},
				},
			],
			perEntity: true,
			entityId: entity.id,
			includedGrant: 75,
			remaining: 50,
		});

		expect(rowAfter({ after, id: "per_entity" })?.entities).toEqual({
			[entity.id]: { id: entity.id, balance: 50, adjustment: -25 },
			[OTHER_ENTITY]: { id: OTHER_ENTITY, balance: 100, adjustment: 0 },
		});
	});

	test("a grant the rows already hold writes nothing", () => {
		expect(
			update({
				customerEntitlements: [
					createCustomerEntitlement({ id: "monthly", balance: 40 }),
				],
				includedGrant: ALLOWANCE,
			}).after,
		).toBeNull();
	});
});
