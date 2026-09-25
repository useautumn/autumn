import { describe, expect, test } from "bun:test";
import { EntInterval, ResetInterval } from "@autumn/shared";
import {
	createSubjectState,
	subjectStateToFullSubject,
	type WorkerCustomer,
	type WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import { setBalance } from "../../../../src/commands/updateBalance/steps/setBalance.js";
import type { DeductionOutcome } from "../../../../src/deduction/types/deductionOutcome.js";
import { customerWith } from "../../deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createUpdateBalanceCommand,
	entity,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

// Mirrors the `remaining` / `current_balance` cases in server/tests/integration/balances/update/.

const FIRST_ENTITY = "ent_07";
const LAST_ENTITY = "ent_99";

/** A customer-level row whose balances live per entity. */
const perEntityRow = ({
	id,
	balances,
	usageAllowed = false,
}: {
	id: string;
	balances: Record<string, number>;
	usageAllowed?: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id }),
	balance: 0,
	usage_allowed: usageAllowed,
	entities: Object.fromEntries(
		Object.entries(balances).map(([entityId, balance]) => [
			entityId,
			{ id: entityId, balance, adjustment: 0 },
		]),
	),
});

const row = ({
	id,
	balance,
	usageAllowed = false,
	createdAt = occurredAt,
	entityOwned = false,
}: {
	id: string;
	balance: number;
	usageAllowed?: boolean;
	createdAt?: number;
	entityOwned?: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id, balance }),
	usage_allowed: usageAllowed,
	created_at: createdAt,
	internal_entity_id: entityOwned ? entity.internal_id : null,
});

const set = ({
	customerEntitlements,
	remaining,
	usage,
	addToBalance,
	entityId = null,
	perEntityRowIds = [],
	lifetimeRowIds = [],
	allowance,
	customer,
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	remaining?: number;
	usage?: number;
	addToBalance?: number;
	entityId?: string | null;
	perEntityRowIds?: string[];
	lifetimeRowIds?: string[];
	/** Every row's catalog allowance: its grant, per entity on a per-entity row. */
	allowance?: number;
	customer?: WorkerCustomer;
}): DeductionOutcome => {
	const state = createSubjectState({
		identity: { ...identity, entityId },
		customer,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		entity: entityId === null ? null : { ...entity, id: entityId },
	});
	const catalog = createCatalogFor({ state });
	for (const customerEntitlement of customerEntitlements) {
		const entitlement =
			catalog.entitlements[customerEntitlement.entitlement_id];
		if (!entitlement) throw new Error("fixture entitlement missing");
		if (perEntityRowIds.includes(customerEntitlement.id))
			entitlement.entity_feature_id = "seats";
		if (lifetimeRowIds.includes(customerEntitlement.id))
			entitlement.interval = EntInterval.Lifetime;
		if (allowance !== undefined) entitlement.allowance = allowance;
	}
	return setBalance({
		fullSubject: subjectStateToFullSubject({ state, catalog, entityId }),
		command: createUpdateBalanceCommand({
			entityId,
			remaining,
			usage,
			addToBalance,
		}),
	});
};

/** Each drawn balance after the set: `id` for a plain row, `id/entity` for a per-entity one. */
const balancesAfter = (outcome: DeductionOutcome): Record<string, number> =>
	Object.fromEntries(
		outcome.context.rows.map((drawn) => {
			const moved = outcome.deltas
				.filter(
					(delta) =>
						delta.table === "customerEntitlements" &&
						delta.id === drawn.id &&
						delta.entityKey === drawn.entityKey,
				)
				.reduce((total, delta) => total + delta.balanceDelta, 0);
			const key = drawn.entityKey ? `${drawn.id}/${drawn.entityKey}` : drawn.id;
			return [key, drawn.balance + moved];
		}),
	);

/** The whole gap was drawn and the drawn balances now sum to the target. */
const expectLandsOn = ({
	outcome,
	remaining,
}: {
	outcome: DeductionOutcome;
	remaining: number;
}) => {
	expect(outcome).toMatchObject({ remaining: 0, rejected: false });
	const total = Object.values(balancesAfter(outcome)).reduce(
		(sum, balance) => sum + balance,
		0,
	);
	expect(total).toBeCloseTo(remaining, 10);
};

describe("setBalance: one row (update-basic)", () => {
	test.each([
		["down", 100, 80],
		["up past the grant", 100, 120],
		["to zero", 100, 0],
		["after a track", 70, 50],
		["to a fraction", 100, 0.01],
		["below zero without usage_allowed", 10, -20],
	])("%s: %d -> %d", (_name, balance, remaining) => {
		const outcome = set({
			customerEntitlements: [row({ id: "monthly", balance })],
			remaining,
		});

		expectLandsOn({ outcome, remaining });
		expect(balancesAfter(outcome).monthly).toBeCloseTo(remaining, 10);
	});
});

describe("setBalance: several rows (update-balance-breakdown, update-basic6)", () => {
	const rows = [
		row({ id: "a", balance: 100 }),
		row({ id: "b", balance: 50, createdAt: occurredAt + 1 }),
	];

	test("a lower target drains rows in draw order", () => {
		const outcome = set({ customerEntitlements: rows, remaining: 30 });

		expectLandsOn({ outcome, remaining: 30 });
		expect(balancesAfter(outcome)).toEqual({ a: 0, b: 30 });
	});

	test("a higher target lands on the first row", () => {
		const outcome = set({ customerEntitlements: rows, remaining: 250 });

		expectLandsOn({ outcome, remaining: 250 });
		expect(balancesAfter(outcome)).toEqual({ a: 200, b: 50 });
	});

	test("a higher target first lifts an overdrawn pay-per-use row back to zero", () => {
		const outcome = set({
			customerEntitlements: [
				row({ id: "free", balance: 0 }),
				row({
					id: "arrear",
					balance: -5,
					usageAllowed: true,
					createdAt: occurredAt + 1,
				}),
			],
			remaining: 20,
		});

		expectLandsOn({ outcome, remaining: 20 });
		expect(balancesAfter(outcome)).toEqual({ free: 20, arrear: 0 });
	});

	test("a negative target drains every row, then takes the first below zero", () => {
		const outcome = set({
			customerEntitlements: [
				row({ id: "free", balance: 10 }),
				row({
					id: "arrear",
					balance: 15,
					usageAllowed: true,
					createdAt: occurredAt + 1,
				}),
			],
			remaining: -10,
		});

		expectLandsOn({ outcome, remaining: -10 });
		expect(balancesAfter(outcome)).toEqual({ free: -10, arrear: 0 });
	});
});

describe("setBalance: per-entity rows (update-balance-per-entity)", () => {
	const threeEntities = perEntityRow({
		id: "per_entity",
		balances: { [FIRST_ENTITY]: 100, [entity.id]: 100, [LAST_ENTITY]: 100 },
	});

	test("a customer-level target drains entities in key order", () => {
		const first = set({
			customerEntitlements: [threeEntities],
			perEntityRowIds: ["per_entity"],
			remaining: 240,
		});
		expectLandsOn({ outcome: first, remaining: 240 });
		expect(balancesAfter(first)).toEqual({
			[`per_entity/${FIRST_ENTITY}`]: 40,
			[`per_entity/${entity.id}`]: 100,
			[`per_entity/${LAST_ENTITY}`]: 100,
		});

		const second = set({
			customerEntitlements: [
				perEntityRow({
					id: "per_entity",
					balances: {
						[FIRST_ENTITY]: 40,
						[entity.id]: 100,
						[LAST_ENTITY]: 100,
					},
				}),
			],
			perEntityRowIds: ["per_entity"],
			remaining: 150,
		});
		expectLandsOn({ outcome: second, remaining: 150 });
		expect(balancesAfter(second)).toEqual({
			[`per_entity/${FIRST_ENTITY}`]: 0,
			[`per_entity/${entity.id}`]: 50,
			[`per_entity/${LAST_ENTITY}`]: 100,
		});
	});

	test("a customer-level target above the sum lands on the first entity", () => {
		const outcome = set({
			customerEntitlements: [
				perEntityRow({
					id: "per_entity",
					balances: { [FIRST_ENTITY]: 0, [entity.id]: 50, [LAST_ENTITY]: 100 },
				}),
			],
			perEntityRowIds: ["per_entity"],
			remaining: 280,
		});

		expectLandsOn({ outcome, remaining: 280 });
		expect(balancesAfter(outcome)[`per_entity/${FIRST_ENTITY}`]).toBe(130);
	});

	test("an entity target moves only that entity's balance, up or down", () => {
		for (const remaining of [70, 120]) {
			const outcome = set({
				customerEntitlements: [threeEntities],
				perEntityRowIds: ["per_entity"],
				entityId: entity.id,
				remaining,
			});

			expectLandsOn({ outcome, remaining });
			expect(balancesAfter(outcome)).toEqual({
				[`per_entity/${entity.id}`]: remaining,
			});
		}
	});

	test("an entity with a monthly and a lifetime row drains the monthly first", () => {
		const outcome = set({
			customerEntitlements: [
				perEntityRow({
					id: "lifetime",
					balances: { [entity.id]: 50, [LAST_ENTITY]: 50 },
				}),
				perEntityRow({
					id: "monthly",
					balances: { [entity.id]: 100, [LAST_ENTITY]: 100 },
				}),
			],
			perEntityRowIds: ["lifetime", "monthly"],
			lifetimeRowIds: ["lifetime"],
			entityId: entity.id,
			remaining: 120,
		});

		expectLandsOn({ outcome, remaining: 120 });
		expect(balancesAfter(outcome)).toEqual({
			[`monthly/${entity.id}`]: 70,
			[`lifetime/${entity.id}`]: 50,
		});
	});

	test("a pay-per-use entity goes below zero", () => {
		const outcome = set({
			customerEntitlements: [
				perEntityRow({
					id: "arrear",
					balances: { [entity.id]: 100, [LAST_ENTITY]: 100 },
					usageAllowed: true,
				}),
			],
			perEntityRowIds: ["arrear"],
			entityId: entity.id,
			remaining: -50,
		});

		expectLandsOn({ outcome, remaining: -50 });
		expect(balancesAfter(outcome)).toEqual({ [`arrear/${entity.id}`]: -50 });
	});
});

describe("setBalance: entity products (update-balance-entity-product)", () => {
	const mixed = [
		row({ id: "customer_level", balance: 50 }),
		row({ id: "entity_own", balance: 100, entityOwned: true }),
	];

	test("an entity's target counts the customer-level row but draws its own row first", () => {
		const outcome = set({
			customerEntitlements: mixed,
			entityId: entity.id,
			remaining: 100,
		});

		expectLandsOn({ outcome, remaining: 100 });
		expect(balancesAfter(outcome)).toEqual({
			entity_own: 50,
			customer_level: 50,
		});
	});

	test("an entity's higher target lands on its own row", () => {
		const outcome = set({
			customerEntitlements: mixed,
			entityId: entity.id,
			remaining: 200,
		});

		expectLandsOn({ outcome, remaining: 200 });
		expect(balancesAfter(outcome)).toEqual({
			entity_own: 150,
			customer_level: 50,
		});
	});
});

describe("setBalance: consumption limits never stop a set", () => {
	test("a spend limit and a usage window are both ignored", () => {
		const outcome = set({
			customer: customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 5 },
				],
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 2,
						interval: ResetInterval.Day,
					},
				],
			}),
			customerEntitlements: [
				row({ id: "arrear", balance: 10, usageAllowed: true }),
			],
			remaining: -50,
		});

		expectLandsOn({ outcome, remaining: -50 });
		expect(
			outcome.changes.filter((change) => change.table === "usageWindows"),
		).toEqual([]);
	});
});

describe("setBalance: usage as a target (update-usage)", () => {
	test.each([
		["overwrites earlier usage", 70, 30, 70],
		["to zero restores the grant", 40, 0, 100],
		["past the grant runs negative", 100, 150, -50],
		["below zero credits", 100, -20, 120],
	])("%s", (_name, balance, usage, landsOn) => {
		const outcome = set({
			customerEntitlements: [row({ id: "monthly", balance })],
			allowance: 100,
			usage,
		});

		expectLandsOn({ outcome, remaining: landsOn });
	});

	test("an adjustment is part of the grant", () => {
		const outcome = set({
			customerEntitlements: [
				{ ...row({ id: "monthly", balance: 120 }), adjustment: 20 },
			],
			allowance: 100,
			usage: 30,
		});

		expectLandsOn({ outcome, remaining: 90 });
	});

	test("customer-level usage on a per-entity row reads the grant across every entity", () => {
		const outcome = set({
			customerEntitlements: [
				perEntityRow({
					id: "per_entity",
					balances: {
						[FIRST_ENTITY]: 100,
						[entity.id]: 100,
						[LAST_ENTITY]: 100,
					},
				}),
			],
			perEntityRowIds: ["per_entity"],
			allowance: 100,
			usage: 60,
		});

		expectLandsOn({ outcome, remaining: 240 });
		expect(balancesAfter(outcome)[`per_entity/${FIRST_ENTITY}`]).toBe(40);
	});

	test("an entity's usage reads only that entity's grant", () => {
		const outcome = set({
			customerEntitlements: [
				perEntityRow({
					id: "per_entity",
					balances: { [entity.id]: 100, [LAST_ENTITY]: 100 },
				}),
			],
			perEntityRowIds: ["per_entity"],
			allowance: 100,
			entityId: entity.id,
			usage: 30,
		});

		expectLandsOn({ outcome, remaining: 70 });
	});
});

describe("setBalance: add_to_balance", () => {
	test("a positive amount lifts an overdrawn row first, then lands on the first row", () => {
		const outcome = set({
			customerEntitlements: [
				row({ id: "free", balance: 0 }),
				row({
					id: "arrear",
					balance: -5,
					usageAllowed: true,
					createdAt: occurredAt + 1,
				}),
			],
			addToBalance: 20,
		});

		expect(outcome).toMatchObject({ remaining: 0 });
		expect(balancesAfter(outcome)).toEqual({ free: 15, arrear: 0 });
	});

	test("a negative amount draws down and counts toward usage windows", () => {
		const outcome = set({
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 100,
						interval: ResetInterval.Day,
					},
				],
			}),
			customerEntitlements: [row({ id: "monthly", balance: 50 })],
			addToBalance: -30,
		});

		expect(balancesAfter(outcome)).toEqual({ monthly: 20 });
		expect(
			outcome.changes.filter((change) => change.table === "usageWindows"),
		).toHaveLength(1);
	});
});

describe("setBalance: a leading unlimited row", () => {
	test("the target sets the unlimited row alone, as the Lua does", () => {
		const outcome = set({
			customerEntitlements: [
				{ ...row({ id: "unlimited", balance: 0 }), unlimited: true },
				row({ id: "finite", balance: 50, createdAt: occurredAt + 1 }),
			],
			remaining: 40,
		});

		expect(balancesAfter(outcome)).toEqual({ unlimited: 40, finite: 50 });
	});
});
