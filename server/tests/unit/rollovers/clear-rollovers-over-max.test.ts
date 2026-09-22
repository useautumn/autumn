import { describe, expect, test } from "bun:test";
import {
	clearRolloversOverMax,
	type Rollover,
	RolloverExpiryDurationType,
	type RolloverMaxCustomerEntitlement,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";

const FEB = Date.UTC(2027, 1, 28);
const MAR = Date.UTC(2027, 2, 31);
const APR = Date.UTC(2027, 3, 30);

type CustomerEntitlementWithRollovers = RolloverMaxCustomerEntitlement & {
	rollovers: Rollover[];
};

const makeCustomerEntitlement = ({
	max = 100,
	rollovers = [],
	entityFeatureId = null,
	hasRolloverConfig = true,
}: {
	max?: number | null;
	rollovers?: Rollover[];
	entityFeatureId?: string | null;
	hasRolloverConfig?: boolean;
} = {}): CustomerEntitlementWithRollovers => ({
	id: "cus_ent_1",
	customer_product_id: null,
	customer_product: null,
	rollovers,
	entitlement: entitlements.build({
		entity_feature_id: entityFeatureId,
		rollover: hasRolloverConfig
			? {
					max,
					max_percentage: null,
					duration: RolloverExpiryDurationType.Month,
					length: 1,
				}
			: null,
	}),
});

const row = (
	id: string,
	balance: number,
	expiresAt: number | null = null,
): Rollover => ({
	id,
	cus_ent_id: "cus_ent_1",
	balance,
	usage: 0,
	expires_at: expiresAt,
	entities: {},
});

const entityRow = (
	id: string,
	balances: Record<string, number>,
	expiresAt: number | null = null,
): Rollover => ({
	...row(id, 0, expiresAt),
	entities: Object.fromEntries(
		Object.entries(balances).map(([entityId, balance]) => [
			entityId,
			{ id: entityId, balance, usage: 0 },
		]),
	),
});

const EMPTY_WRITES = { inserts: [], updates: [], deleteIds: [] };

describe("clearRolloversOverMax: nothing carried over", () => {
	test("empty newRollovers writes nothing even when existing rows exceed the cap", () => {
		const existing = [row("forever", 500), row("feb", 500, FEB)];
		const cusEnt = makeCustomerEntitlement({ max: 10, rollovers: existing });

		const writes = clearRolloversOverMax({ cusEnt, newRollovers: [] });

		expect(writes).toEqual(EMPTY_WRITES);
		expect(cusEnt.rollovers.map(({ id }) => id)).toEqual(["forever", "feb"]);
	});
});

describe("clearRolloversOverMax: no cap", () => {
	test("no rollover config inserts every new row untouched", () => {
		const newRollover = row("new", 1_000, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				hasRolloverConfig: false,
				rollovers: [row("old", 1_000, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({ ...EMPTY_WRITES, inserts: [newRollover] });
	});

	test("max null inserts every new row untouched", () => {
		const newRollover = row("new", 1_000, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: null,
				rollovers: [row("old", 1_000, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({ ...EMPTY_WRITES, inserts: [newRollover] });
	});
});

describe("clearRolloversOverMax: non-entity merge", () => {
	test("under the cap: the new row is inserted untouched", () => {
		const newRollover = row("new", 30, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 100,
				rollovers: [row("old", 40, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({ ...EMPTY_WRITES, inserts: [newRollover] });
	});

	test("new row untouched while an existing row is trimmed into updates", () => {
		const newRollover = row("new", 60, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 100,
				rollovers: [row("old", 70, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({
			inserts: [newRollover],
			updates: [row("old", 40, FEB)],
			deleteIds: [],
		});
	});

	test("new row untouched while an existing row is drained into deleteIds", () => {
		const newRollover = row("new", 100, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 100,
				rollovers: [row("old", 70, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({
			inserts: [newRollover],
			updates: [],
			deleteIds: ["old"],
		});
	});

	test("existing drained and the new row trimmed: new row is inserted trimmed, never updated", () => {
		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 150,
				rollovers: [row("old", 100, FEB)],
			}),
			newRollovers: [row("new", 200, MAR)],
		});

		expect(writes).toEqual({
			inserts: [row("new", 150, MAR)],
			updates: [],
			deleteIds: ["old"],
		});
	});

	test("the only row is new and over the cap: inserted trimmed", () => {
		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({ max: 100 }),
			newRollovers: [row("new", 400, MAR)],
		});

		expect(writes).toEqual({
			...EMPTY_WRITES,
			inserts: [row("new", 100, MAR)],
		});
	});

	test("new row drained ahead of forever rows: not inserted and not in deleteIds", () => {
		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 300,
				rollovers: [row("forever", 300)],
			}),
			newRollovers: [row("new", 100, MAR)],
		});

		expect(writes).toEqual(EMPTY_WRITES);
	});

	test("cap 0: every existing row is deleted and nothing is inserted", () => {
		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 0,
				rollovers: [row("feb", 10, FEB), row("forever", 20)],
			}),
			newRollovers: [row("new", 30, MAR)],
		});

		expect(writes).toEqual({
			inserts: [],
			updates: [],
			deleteIds: ["feb", "forever"],
		});
	});

	test("excess spans an existing delete, an existing trim and leaves the new row", () => {
		const newRollover = row("new", 50, APR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 80,
				rollovers: [row("mar", 40, MAR), row("feb", 20, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({
			inserts: [newRollover],
			updates: [row("mar", 30, MAR)],
			deleteIds: ["feb"],
		});
	});

	test("two new rows: the older is drained, the newer trimmed", () => {
		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({ max: 30 }),
			newRollovers: [row("new_apr", 40, APR), row("new_mar", 30, MAR)],
		});

		expect(writes).toEqual({
			inserts: [row("new_apr", 30, APR)],
			updates: [],
			deleteIds: [],
		});
	});

	test("total exactly at the cap re-emits the oldest existing row as an update", () => {
		const newRollover = row("new", 40, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: makeCustomerEntitlement({
				max: 100,
				rollovers: [row("old", 60, FEB)],
			}),
			newRollovers: [newRollover],
		});

		// NOTE: current behavior; possible bug: a no-op update is written when nothing is over the cap.
		expect(writes).toEqual({
			inserts: [newRollover],
			updates: [row("old", 60, FEB)],
			deleteIds: [],
		});
	});

	test("does not reorder cusEnt.rollovers or mutate the new rows", () => {
		const existing = [row("forever", 90), row("feb", 90, FEB)];
		const newRollover = row("new", 90, MAR);
		const cusEnt = makeCustomerEntitlement({ max: 100, rollovers: existing });

		clearRolloversOverMax({ cusEnt, newRollovers: [newRollover] });

		expect(cusEnt.rollovers.map(({ id }) => id)).toEqual(["forever", "feb"]);
		expect(existing[1].balance).toBe(90);
		expect(newRollover.balance).toBe(90);
	});
});

describe("clearRolloversOverMax: entity merge", () => {
	const entityCusEnt = ({
		max,
		rollovers,
	}: {
		max: number;
		rollovers: Rollover[];
	}) => makeCustomerEntitlement({ max, rollovers, entityFeatureId: "seats" });

	test("existing row trimmed per entity lands in updates; new row inserted untouched", () => {
		const newRollover = entityRow("new", { e1: 200, e2: 50 }, MAR);

		const writes = clearRolloversOverMax({
			cusEnt: entityCusEnt({
				max: 250,
				rollovers: [entityRow("old", { e1: 300 }, FEB)],
			}),
			newRollovers: [newRollover],
		});

		expect(writes).toEqual({
			inserts: [newRollover],
			updates: [entityRow("old", { e1: 50 }, FEB)],
			deleteIds: [],
		});
	});

	test("existing drained per entity is deleted; new row inserted trimmed", () => {
		const writes = clearRolloversOverMax({
			cusEnt: entityCusEnt({
				max: 60,
				rollovers: [entityRow("old", { e1: 80 }, FEB)],
			}),
			newRollovers: [entityRow("new", { e1: 70, e2: 10 }, MAR)],
		});

		expect(writes).toEqual({
			inserts: [entityRow("new", { e1: 60, e2: 10 }, MAR)],
			updates: [],
			deleteIds: ["old"],
		});
	});

	test("existing row kept for another entity lands in updates while the new row is inserted trimmed", () => {
		const writes = clearRolloversOverMax({
			cusEnt: entityCusEnt({
				max: 40,
				rollovers: [entityRow("old", { e1: 100, e2: 10 }, FEB)],
			}),
			newRollovers: [entityRow("new", { e1: 50 }, MAR)],
		});

		expect(writes).toEqual({
			inserts: [entityRow("new", { e1: 40 }, MAR)],
			updates: [entityRow("old", { e1: 0, e2: 10 }, FEB)],
			deleteIds: [],
		});
	});

	test("new row whose every entity drains is dropped", () => {
		const writes = clearRolloversOverMax({
			cusEnt: entityCusEnt({
				max: 100,
				rollovers: [entityRow("forever", { e1: 100 })],
			}),
			newRollovers: [entityRow("new", { e1: 30 }, MAR)],
		});

		expect(writes).toEqual(EMPTY_WRITES);
	});
});
