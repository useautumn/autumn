import { describe, expect, test } from "bun:test";
import {
	customerEntitlementToNextResetAt,
	EntInterval,
	getCycleEnd,
	getNextResetAt,
	type NextResetAtCustomerEntitlement,
	resetNeedsBillingCycleAnchor,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";

const utc = (year: number, month: number, day: number, hour = 0): number =>
	new UTCDate(year, month - 1, day, hour).getTime();

const rowOf = ({
	cycleEndedAt,
	interval = EntInterval.Month,
	intervalCount = 1,
	plan = { billing_cycle_anchor_resets_at: null },
}: {
	cycleEndedAt: number;
	interval?: EntInterval;
	intervalCount?: number;
	plan?: NextResetAtCustomerEntitlement["customer_product"];
}): NextResetAtCustomerEntitlement => ({
	next_reset_at: cycleEndedAt,
	entitlement: { interval, interval_count: intervalCount },
	customer_product: plan,
});

const stepped = ({
	row,
	now,
}: {
	row: NextResetAtCustomerEntitlement;
	now: number;
}) =>
	getNextResetAt({
		curReset: row.next_reset_at,
		interval: row.entitlement.interval,
		intervalCount: row.entitlement.interval_count ?? 1,
		now,
	});

describe("customerEntitlementToNextResetAt", () => {
	const now = utc(2027, 3, 15);

	test("steps past now one interval at a time; a loose grant is never clamped", () => {
		const row = rowOf({ cycleEndedAt: utc(2026, 12, 14), plan: null });
		expect(
			customerEntitlementToNextResetAt({ customerEntitlement: row, now }),
		).toBe(utc(2027, 4, 14));
		expect(stepped({ row, now })).toBe(utc(2027, 4, 14));
	});

	test("a pending anchor reset caps the next reset only when it is still ahead of the cycle that ended", () => {
		const cycleEndedAt = utc(2027, 3, 14);
		const ahead = rowOf({
			cycleEndedAt,
			plan: { billing_cycle_anchor_resets_at: utc(2027, 4, 1) },
		});
		expect(
			customerEntitlementToNextResetAt({ customerEntitlement: ahead, now }),
		).toBe(utc(2027, 4, 1));

		const behind = rowOf({
			cycleEndedAt,
			plan: { billing_cycle_anchor_resets_at: utc(2027, 3, 1) },
		});
		expect(
			customerEntitlementToNextResetAt({ customerEntitlement: behind, now }),
		).toBe(utc(2027, 4, 14));
	});

	test("the anchor is wanted only for a plan's row on a long interval landing on the 30th or 28 Feb", () => {
		const onThe30th = rowOf({ cycleEndedAt: utc(2027, 3, 30) });
		expect(
			resetNeedsBillingCycleAnchor({ customerEntitlement: onThe30th, now }),
		).toBe(true);
		expect(
			resetNeedsBillingCycleAnchor({
				customerEntitlement: rowOf({ cycleEndedAt: utc(2028, 1, 28) }),
				now: utc(2028, 2, 1),
			}),
		).toBe(true);
		expect(
			resetNeedsBillingCycleAnchor({
				customerEntitlement: rowOf({ cycleEndedAt: utc(2027, 3, 14) }),
				now,
			}),
		).toBe(false);
		expect(
			resetNeedsBillingCycleAnchor({
				customerEntitlement: rowOf({
					cycleEndedAt: utc(2027, 3, 30, 6),
					interval: EntInterval.Hour,
					intervalCount: 4,
				}),
				now: utc(2027, 3, 30, 7),
			}),
		).toBe(false);
		expect(
			resetNeedsBillingCycleAnchor({
				customerEntitlement: rowOf({
					cycleEndedAt: utc(2027, 3, 30),
					plan: null,
				}),
				now,
			}),
		).toBe(false);
	});

	test("on an edge date the anchor's cycle end wins when stepping drifted early", () => {
		// A month-end subscription drifted to the 30th; stepping stays on the 30th, the anchor bills on the 31st.
		const cycleEndedAt = utc(2027, 4, 30);
		const row = rowOf({ cycleEndedAt });
		const anchor = utc(2027, 1, 31);
		const now = utc(2027, 5, 1);
		expect(stepped({ row, now })).toBe(utc(2027, 5, 30));
		expect(
			getCycleEnd({
				anchor,
				interval: EntInterval.Month,
				intervalCount: 1,
				now: cycleEndedAt,
			}),
		).toBe(utc(2027, 5, 31));
		expect(
			customerEntitlementToNextResetAt({
				customerEntitlement: row,
				billingCycleAnchor: anchor,
				now,
			}),
		).toBe(utc(2027, 5, 31));
	});

	test("an anchor handed over off an edge date is ignored", () => {
		const row = rowOf({ cycleEndedAt: utc(2027, 3, 14) });
		expect(
			customerEntitlementToNextResetAt({
				customerEntitlement: row,
				billingCycleAnchor: utc(2027, 1, 31),
				now,
			}),
		).toBe(utc(2027, 4, 14));
	});
});
