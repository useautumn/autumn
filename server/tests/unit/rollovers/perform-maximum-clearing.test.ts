import { describe, expect, test } from "bun:test";
import {
	type EntityRolloverBalance,
	performMaximumClearing,
	type Rollover,
	type RolloverConfig,
	RolloverExpiryDurationType,
	type RolloverMaxCustomerEntitlement,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";

const FEB = Date.UTC(2027, 1, 28);
const MAR = Date.UTC(2027, 2, 31);
const APR = Date.UTC(2027, 3, 30);

const makeCustomerEntitlement = ({
	max = 100,
	maxPercentage = null,
	allowance = 100,
	entityFeatureId = null,
	rollover,
}: {
	max?: number | null;
	maxPercentage?: number | null;
	allowance?: number;
	entityFeatureId?: string | null;
	rollover?: RolloverConfig | null;
} = {}): RolloverMaxCustomerEntitlement => ({
	id: "cus_ent_1",
	customer_product_id: null,
	customer_product: null,
	entitlement: entitlements.build({
		allowance,
		entity_feature_id: entityFeatureId,
		rollover:
			rollover === undefined
				? {
						max,
						max_percentage: maxPercentage,
						duration: RolloverExpiryDurationType.Month,
						length: 1,
					}
				: rollover,
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
			{ id: entityId, balance, usage: 0 } satisfies EntityRolloverBalance,
		]),
	),
});

const ids = (rows: Rollover[]) => rows.map(({ id }) => id);

describe("performMaximumClearing: no cap", () => {
	test("no rollover config returns no changes", () => {
		const result = performMaximumClearing({
			rows: [row("a", 1_000)],
			cusEnt: makeCustomerEntitlement({ rollover: null }),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [] });
	});

	test("max null (unlimited) returns no changes and leaves rows unsorted", () => {
		const rows = [row("forever", 500), row("feb", 500, FEB)];

		const result = performMaximumClearing({
			rows,
			cusEnt: makeCustomerEntitlement({ max: null }),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [] });
		expect(ids(rows)).toEqual(["forever", "feb"]);
	});

	test("empty rows return no changes", () => {
		const result = performMaximumClearing({
			rows: [],
			cusEnt: makeCustomerEntitlement({ max: 0 }),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [] });
	});
});

describe("performMaximumClearing: ordering", () => {
	test("sorts expiring rows ascending and puts forever rows last", () => {
		const rows = [
			row("forever_1", 1),
			row("apr", 1, APR),
			row("forever_2", 1),
			row("feb", 1, FEB),
			row("mar", 1, MAR),
		];

		performMaximumClearing({ rows, cusEnt: makeCustomerEntitlement() });

		expect(ids(rows)).toEqual(["feb", "mar", "apr", "forever_1", "forever_2"]);
	});

	test("the sort mutates the caller's rows array in place", () => {
		const rows = [row("forever", 10), row("feb", 10, FEB)];
		const callerView = rows;

		performMaximumClearing({ rows, cusEnt: makeCustomerEntitlement() });

		// NOTE: current behavior; possible bug: callers passing a live array (e.g. cusEnt.rollovers) see it reordered.
		expect(ids(callerView)).toEqual(["feb", "forever"]);
	});

	test("an expires_at of 0 is treated like a forever row", () => {
		const rows = [row("zero", 1, 0), row("feb", 1, FEB)];

		performMaximumClearing({ rows, cusEnt: makeCustomerEntitlement() });

		expect(ids(rows)).toEqual(["feb", "zero"]);
	});

	test("the oldest expiring row is trimmed before a forever row listed first", () => {
		const result = performMaximumClearing({
			rows: [row("forever", 80), row("feb", 50, FEB)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result.toDelete).toEqual([]);
		expect(result.toUpdate).toEqual([row("feb", 20, FEB)]);
	});

	test("between two forever rows the first listed is trimmed first", () => {
		const result = performMaximumClearing({
			rows: [row("forever_1", 60), row("forever_2", 60)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result.toDelete).toEqual([]);
		expect(result.toUpdate).toEqual([row("forever_1", 40)]);
	});
});

describe("performMaximumClearing: non-entity trimming", () => {
	test("total under max returns no changes", () => {
		const result = performMaximumClearing({
			rows: [row("a", 30, FEB), row("b", 40, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [] });
	});

	test("total exactly at max re-emits the oldest row unchanged", () => {
		const result = performMaximumClearing({
			rows: [row("a", 60, FEB), row("b", 40, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		// NOTE: current behavior; possible bug: excess 0 still enters the loop and emits a no-op update.
		expect(result).toEqual({ toDelete: [], toUpdate: [row("a", 60, FEB)] });
	});

	test("total exactly at max deletes a zero-balance oldest row", () => {
		const result = performMaximumClearing({
			rows: [row("empty", 0, FEB), row("b", 100, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result).toEqual({ toDelete: ["empty"], toUpdate: [] });
	});

	test("a single row over max is trimmed to max", () => {
		const result = performMaximumClearing({
			rows: [row("a", 250, FEB)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [row("a", 100, FEB)] });
	});

	test("the trimmed row keeps every other field", () => {
		const original: Rollover = { ...row("a", 250, FEB), usage: 7 };

		const result = performMaximumClearing({
			rows: [original],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result.toUpdate).toEqual([{ ...original, balance: 100 }]);
		expect(original.balance).toBe(250);
	});

	test("excess spanning two of three rows deletes the oldest and trims the next", () => {
		const result = performMaximumClearing({
			rows: [row("mar", 50, MAR), row("apr", 50, APR), row("feb", 50, FEB)],
			cusEnt: makeCustomerEntitlement({ max: 60 }),
		});

		expect(result).toEqual({
			toDelete: ["feb"],
			toUpdate: [row("mar", 10, MAR)],
		});
	});

	test("excess exactly equal to the oldest row deletes it and stops", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 40, FEB), row("mar", 50, MAR), row("apr", 50, APR)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result).toEqual({ toDelete: ["feb"], toUpdate: [] });
	});

	test("excess exactly equal to two rows deletes both and leaves the third", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 40, FEB), row("mar", 30, MAR), row("apr", 50, APR)],
			cusEnt: makeCustomerEntitlement({ max: 50 }),
		});

		expect(result).toEqual({ toDelete: ["feb", "mar"], toUpdate: [] });
	});

	test("cap 0 deletes every row", () => {
		const result = performMaximumClearing({
			rows: [row("forever", 5), row("feb", 10, FEB), row("mar", 20, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 0 }),
		});

		expect(result).toEqual({
			toDelete: ["feb", "mar", "forever"],
			toUpdate: [],
		});
	});

	test("excess larger than every row (negative max) deletes all rows", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 10, FEB), row("mar", 20, MAR)],
			cusEnt: makeCustomerEntitlement({ max: -50 }),
		});

		expect(result).toEqual({ toDelete: ["feb", "mar"], toUpdate: [] });
	});

	test("zero-balance rows ahead of the excess are deleted on the way", () => {
		const result = performMaximumClearing({
			rows: [row("empty", 0, FEB), row("mar", 80, MAR), row("apr", 80, APR)],
			cusEnt: makeCustomerEntitlement({ max: 100 }),
		});

		expect(result).toEqual({
			toDelete: ["empty"],
			toUpdate: [row("mar", 20, MAR)],
		});
	});

	test("max_percentage drives the cap", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 300, FEB)],
			cusEnt: makeCustomerEntitlement({
				max: 9_999,
				maxPercentage: 50,
				allowance: 400,
			}),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [row("feb", 200, FEB)] });
	});
});

describe("performMaximumClearing: decimals", () => {
	test("exact decimal trimming", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 1.5, FEB), row("mar", 2.25, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 3 }),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [row("feb", 0.75, FEB)] });
	});

	test("0.1 + 0.2 at a cap of 0.3 emits a spurious float-dust trim", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 0.1, FEB), row("mar", 0.2, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 0.3 }),
		});

		// NOTE: current behavior; possible bug: total is summed with floats (0.30000000000000004), not Decimal.
		expect(result).toEqual({
			toDelete: [],
			toUpdate: [row("feb", 0.09999999999999996, FEB)],
		});
	});

	test("0.1 + 0.2 at a cap of 0.1 leaves float dust on the surviving row", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 0.1, FEB), row("mar", 0.2, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 0.1 }),
		});

		// NOTE: current behavior; possible bug: survivor lands at 0.09999999999999996, not 0.1.
		expect(result).toEqual({
			toDelete: ["feb"],
			toUpdate: [row("mar", 0.09999999999999996, MAR)],
		});
	});

	test("fractional rows trimmed to an integer cap", () => {
		const result = performMaximumClearing({
			rows: [row("feb", 0.7, FEB), row("mar", 0.6, MAR)],
			cusEnt: makeCustomerEntitlement({ max: 1 }),
		});

		expect(result.toDelete).toEqual([]);
		expect(result.toUpdate).toHaveLength(1);
		expect(result.toUpdate[0].id).toBe("feb");
		expect(result.toUpdate[0].balance).toBeCloseTo(0.4, 12);
	});
});

describe("performMaximumClearing: entity mode", () => {
	const ENTITY_FEATURE_ID = "seats";
	const entityCusEnt = (max: number | null) =>
		makeCustomerEntitlement({ max, entityFeatureId: ENTITY_FEATURE_ID });

	test("all entities under max returns no changes", () => {
		const result = performMaximumClearing({
			rows: [entityRow("feb", { e1: 40, e2: 10 }, FEB)],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [] });
	});

	test("an entity exactly at max is untouched", () => {
		const result = performMaximumClearing({
			rows: [entityRow("feb", { e1: 50 }, FEB)],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({ toDelete: [], toUpdate: [] });
	});

	test("one entity over max is trimmed on a single row", () => {
		const result = performMaximumClearing({
			rows: [entityRow("feb", { e1: 80, e2: 10 }, FEB)],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({
			toDelete: [],
			toUpdate: [entityRow("feb", { e1: 50, e2: 10 }, FEB)],
		});
	});

	test("each entity is capped independently", () => {
		const result = performMaximumClearing({
			rows: [entityRow("feb", { e1: 80, e2: 70 }, FEB)],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({
			toDelete: [],
			toUpdate: [entityRow("feb", { e1: 50, e2: 50 }, FEB)],
		});
	});

	test("trims the oldest row first per entity", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("mar", { e1: 40 }, MAR),
				entityRow("feb", { e1: 40 }, FEB),
			],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({
			toDelete: [],
			toUpdate: [entityRow("feb", { e1: 10 }, FEB)],
		});
	});

	test("a row whose every entity drains to 0 is deleted; the next is trimmed", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e1: 30 }, FEB),
				entityRow("mar", { e1: 40 }, MAR),
			],
			cusEnt: entityCusEnt(20),
		});

		expect(result).toEqual({
			toDelete: ["feb"],
			toUpdate: [entityRow("mar", { e1: 20 }, MAR)],
		});
	});

	test("excess exactly equal to a row's entity balance deletes the row", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e1: 30 }, FEB),
				entityRow("mar", { e1: 40 }, MAR),
			],
			cusEnt: entityCusEnt(40),
		});

		expect(result).toEqual({ toDelete: ["feb"], toUpdate: [] });
	});

	test("a row missing an over-cap entity is skipped for that entity", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e2: 5 }, FEB),
				entityRow("mar", { e1: 60 }, MAR),
				entityRow("apr", { e1: 60 }, APR),
			],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({
			toDelete: ["mar"],
			toUpdate: [entityRow("apr", { e1: 50 }, APR)],
		});
	});

	test("a trimmed entity has its usage reset to 0", () => {
		const original: Rollover = {
			...row("feb", 0, FEB),
			entities: { e1: { id: "e1", balance: 80, usage: 12 } },
		};

		const result = performMaximumClearing({
			rows: [original],
			cusEnt: entityCusEnt(50),
		});

		// NOTE: current behavior; possible bug: entity usage is zeroed on trim while non-entity mode keeps row usage.
		expect(result.toUpdate[0].entities.e1).toEqual({
			id: "e1",
			balance: 50,
			usage: 0,
		});
		expect(original.entities.e1.balance).toBe(80);
	});

	test("cap 0 deletes every row", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e1: 10, e2: 5 }, FEB),
				entityRow("forever", { e1: 20 }),
			],
			cusEnt: entityCusEnt(0),
		});

		expect(result).toEqual({ toDelete: ["feb", "forever"], toUpdate: [] });
	});

	test("a row already at zero for every entity is deleted even under the cap", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e1: 0 }, FEB),
				entityRow("mar", { e1: 10 }, MAR),
			],
			cusEnt: entityCusEnt(50),
		});

		expect(result).toEqual({ toDelete: ["feb"], toUpdate: [] });
	});

	test("a row with no entities at all is deleted even under the cap", () => {
		const result = performMaximumClearing({
			rows: [entityRow("feb", {}, FEB)],
			cusEnt: entityCusEnt(50),
		});

		// NOTE: current behavior; possible bug: every() over no entities is true, so an empty row is deleted.
		expect(result).toEqual({ toDelete: ["feb"], toUpdate: [] });
	});

	test("decimal entity balances: 0.1 + 0.2 at a cap of 0.25 trims the oldest row", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e1: 0.1 }, FEB),
				entityRow("mar", { e1: 0.2 }, MAR),
			],
			cusEnt: entityCusEnt(0.25),
		});

		// NOTE: current behavior; possible bug: float-summed entity total leaves 0.04999999999999996, not 0.05.
		expect(result).toEqual({
			toDelete: [],
			toUpdate: [entityRow("feb", { e1: 0.04999999999999996 }, FEB)],
		});
	});

	test("decimal entity balances trimmed exactly when the sum is representable", () => {
		const result = performMaximumClearing({
			rows: [
				entityRow("feb", { e1: 1.5 }, FEB),
				entityRow("mar", { e1: 2.25 }, MAR),
			],
			cusEnt: entityCusEnt(3),
		});

		expect(result).toEqual({
			toDelete: [],
			toUpdate: [entityRow("feb", { e1: 0.75 }, FEB)],
		});
	});
});
