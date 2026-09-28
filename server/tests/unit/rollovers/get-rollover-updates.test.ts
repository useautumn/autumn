import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	type EntityBalance,
	getRolloverUpdates,
	type RolloverConfig,
	RolloverExpiryDurationType,
	type RolloverUpdatesCustomerEntitlement,
} from "@autumn/shared";

const CUSTOMER_ENTITLEMENT_ID = "cus_ent_1";
const ENTITY_FEATURE_ID = "seats";

const monthly = (length = 1): RolloverConfig => ({
	max: null,
	duration: RolloverExpiryDurationType.Month,
	length,
});

const forever: RolloverConfig = {
	max: null,
	duration: RolloverExpiryDurationType.Forever,
	length: 1,
};

const entityBalance = (id: string, balance: number): EntityBalance => ({
	id,
	balance,
	adjustment: 0,
});

const makeCustomerEntitlement = ({
	balance = 100,
	entities = null,
	entityFeatureId = null,
	rollover = monthly(),
}: {
	balance?: number | null;
	entities?: Record<string, EntityBalance> | null;
	entityFeatureId?: string | null;
	rollover?: RolloverConfig | null;
} = {}): RolloverUpdatesCustomerEntitlement => ({
	id: CUSTOMER_ENTITLEMENT_ID,
	balance,
	entities,
	entitlement: { entity_feature_id: entityFeatureId, rollover },
});

const CYCLE_ENDED_AT = Date.UTC(2027, 0, 31);

// Month arithmetic runs in the process time zone; pin UTC like production and restore after.
const originalTimeZone =
	process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
beforeAll(() => {
	process.env.TZ = "UTC";
});
afterAll(() => {
	process.env.TZ = originalTimeZone;
});

describe("getRolloverUpdates: when nothing carries over", () => {
	test("no rollover config inserts nothing even with a positive balance", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ balance: 500, rollover: null }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
	});

	test("zero balance inserts nothing", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ balance: 0 }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});

	test("negative balance (overage) inserts nothing", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ balance: -25 }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});

	test("null balance inserts nothing", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ balance: null }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});

	test("entity mode with every entity at zero or negative inserts nothing", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: {
					e1: entityBalance("e1", 0),
					e2: entityBalance("e2", -10),
				},
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});

	test("entity mode ignores the top-level balance when no entity has balance", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				balance: 999,
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: { e1: entityBalance("e1", 0) },
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});

	test("entity mode with null entities inserts nothing", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: null,
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});

	test("entity mode with an entity balance but no rollover config inserts nothing", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				rollover: null,
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: { e1: entityBalance("e1", 50) },
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toEqual([]);
	});
});

describe("getRolloverUpdates: non-entity carry", () => {
	test("carries the whole positive balance into one new row", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ balance: 40 }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toDelete).toEqual([]);
		expect(update.toUpdate).toEqual([]);
		expect(update.toInsert).toHaveLength(1);
		const [rollover] = update.toInsert;
		expect(rollover.id.startsWith("roll_")).toBe(true);
		expect(rollover).toEqual({
			id: rollover.id,
			cus_ent_id: CUSTOMER_ENTITLEMENT_ID,
			balance: 40,
			usage: 0,
			expires_at: Date.UTC(2027, 1, 28),
			entities: {},
		});
	});

	test("carries a fractional balance as is", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ balance: 0.1 + 0.2 }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert[0].balance).toBe(0.1 + 0.2);
	});

	test("each call mints a fresh rollover id", () => {
		const cusEnt = makeCustomerEntitlement();
		const first = getRolloverUpdates({ cusEnt, nextResetAt: CYCLE_ENDED_AT });
		const second = getRolloverUpdates({ cusEnt, nextResetAt: CYCLE_ENDED_AT });

		expect(first.toInsert[0].id).not.toBe(second.toInsert[0].id);
	});
});

describe("getRolloverUpdates: entity carry", () => {
	test("carries each entity with a positive balance and drops the rest", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				balance: 999,
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: {
					e1: { id: "e1", balance: 30, adjustment: 5, additional_balance: 2 },
					e2: entityBalance("e2", 0),
					e3: entityBalance("e3", -4),
					e4: entityBalance("e4", 12.5),
				},
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toHaveLength(1);
		const [rollover] = update.toInsert;
		expect(rollover.balance).toBe(0);
		expect(rollover.usage).toBe(0);
		expect(rollover.cus_ent_id).toBe(CUSTOMER_ENTITLEMENT_ID);
		expect(rollover.expires_at).toBe(Date.UTC(2027, 1, 28));
		expect(rollover.entities).toEqual({
			e1: { id: "e1", balance: 30, usage: 0 },
			e4: { id: "e4", balance: 12.5, usage: 0 },
		});
	});

	test("inserts when a single entity has balance even if the top-level balance is zero", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				balance: 0,
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: { e1: entityBalance("e1", 0), e2: entityBalance("e2", 1) },
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert).toHaveLength(1);
		expect(Object.keys(update.toInsert[0].entities)).toEqual(["e2"]);
	});
});

describe("getRolloverUpdates: expiry is the cycle that ended plus the rollover length", () => {
	test("length 1 from a cycle ending Jan 31 expires Feb 28 (clamped, non-leap year)", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ rollover: monthly(1) }),
			nextResetAt: Date.UTC(2027, 0, 31),
		});

		expect(update.toInsert[0].expires_at).toBe(Date.UTC(2027, 1, 28));
	});

	test("length 1 from a cycle ending Jan 31 in a leap year expires Feb 29", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ rollover: monthly(1) }),
			nextResetAt: Date.UTC(2028, 0, 31),
		});

		expect(update.toInsert[0].expires_at).toBe(Date.UTC(2028, 1, 29));
	});

	test("length 2 from a cycle ending Mar 15 expires May 15", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ rollover: monthly(2) }),
			nextResetAt: Date.UTC(2027, 2, 15),
		});

		expect(update.toInsert[0].expires_at).toBe(Date.UTC(2027, 4, 15));
	});

	test("length 12 crosses the year boundary and keeps the time of day", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ rollover: monthly(12) }),
			nextResetAt: Date.UTC(2027, 10, 30, 17, 45, 12, 345),
		});

		expect(update.toInsert[0].expires_at).toBe(
			Date.UTC(2028, 10, 30, 17, 45, 12, 345),
		);
	});

	test("length 0 expires at the very instant the cycle ended", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ rollover: monthly(0) }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		// NOTE: current behavior; possible bug: a length-0 rollover is born already expired.
		expect(update.toInsert[0].expires_at).toBe(CYCLE_ENDED_AT);
	});

	test("forever duration never expires", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({ rollover: forever }),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert[0].expires_at).toBeNull();
	});

	test("forever duration in entity mode never expires", () => {
		const update = getRolloverUpdates({
			cusEnt: makeCustomerEntitlement({
				rollover: forever,
				entityFeatureId: ENTITY_FEATURE_ID,
				entities: { e1: entityBalance("e1", 5) },
			}),
			nextResetAt: CYCLE_ENDED_AT,
		});

		expect(update.toInsert[0].expires_at).toBeNull();
	});

	test("contract: callers pass the cycle that ENDED; passing the new next_reset_at grants an extra month", () => {
		const cycleEndedAt = Date.UTC(2027, 2, 15);
		const newNextResetAt = Date.UTC(2027, 3, 15);
		const cusEnt = makeCustomerEntitlement({ rollover: monthly(1) });

		const correct = getRolloverUpdates({ cusEnt, nextResetAt: cycleEndedAt });
		const wrong = getRolloverUpdates({ cusEnt, nextResetAt: newNextResetAt });

		// A 1-month rollover lives exactly one cycle: it expires when the new cycle ends.
		expect(correct.toInsert[0].expires_at).toBe(newNextResetAt);
		expect(wrong.toInsert[0].expires_at).toBe(Date.UTC(2027, 4, 15));
		expect(wrong.toInsert[0].expires_at).not.toBe(
			correct.toInsert[0].expires_at,
		);
	});

	test("expiry depends on the process time zone (month math is local time)", () => {
		const cycleEndedAt = Date.UTC(2027, 1, 28, 23, 30);
		const cusEnt = makeCustomerEntitlement({ rollover: monthly(1) });

		const inUtc = getRolloverUpdates({ cusEnt, nextResetAt: cycleEndedAt });
		process.env.TZ = "Europe/Paris";
		try {
			const inParis = getRolloverUpdates({ cusEnt, nextResetAt: cycleEndedAt });
			// NOTE: current behavior; possible bug: expiry is TZ-dependent (Mar 28 in UTC vs Mar 31 in Paris).
			expect(inUtc.toInsert[0].expires_at).toBe(Date.UTC(2027, 2, 28, 23, 30));
			expect(inParis.toInsert[0].expires_at).toBe(
				Date.UTC(2027, 2, 31, 22, 30),
			);
		} finally {
			process.env.TZ = "UTC";
		}
	});
});
