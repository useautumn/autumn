import { describe, expect, test } from "bun:test";
import type { PhaseProrationBehavior } from "@autumn/shared";
import {
	phaseStartCreditsUnusedTime,
	phaseStartRaisesInvoice,
	resolvePhaseStartProrationBehavior,
} from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";

const PHASE_START_MS = Date.UTC(2027, 2, 1);

const resolve = ({
	requestedProrationBehavior,
	requestedStartsAt = PHASE_START_MS,
	resetsBillingCycle = false,
	changesCustomerProducts = true,
}: {
	requestedProrationBehavior?: PhaseProrationBehavior;
	requestedStartsAt?: number;
	resetsBillingCycle?: boolean;
	changesCustomerProducts?: boolean;
}) =>
	resolvePhaseStartProrationBehavior({
		phaseProrations: requestedProrationBehavior
			? [
					{
						startsAt: requestedStartsAt,
						prorationBehavior: requestedProrationBehavior,
					},
				]
			: [],
		phaseStartMs: PHASE_START_MS,
		resetsBillingCycle,
		changesCustomerProducts,
	});

describe("resolvePhaseStartProrationBehavior", () => {
	test("without a request, a reset that switches plans skips proration and anything else keeps Stripe's default", () => {
		expect(resolve({ resetsBillingCycle: true })).toBe("none");
		expect(
			resolve({ resetsBillingCycle: true, changesCustomerProducts: false }),
		).toBeUndefined();
		expect(resolve({})).toBeUndefined();
	});

	test("a requested proration wins over the default, matched to the second", () => {
		expect(
			resolve({
				requestedProrationBehavior: "prorate_immediately",
				resetsBillingCycle: true,
			}),
		).toBe("prorate_immediately");
		expect(
			resolve({
				requestedProrationBehavior: "none",
				requestedStartsAt: PHASE_START_MS + 400,
			}),
		).toBe("none");
		expect(
			resolve({
				requestedProrationBehavior: "none",
				requestedStartsAt: PHASE_START_MS - 1000,
			}),
		).toBeUndefined();
	});
});

describe("phase start billing", () => {
	test("only none withholds the old plan's unused-time credit", () => {
		expect(
			phaseStartCreditsUnusedTime({ prorationBehavior: "prorate_immediately" }),
		).toBe(true);
		expect(phaseStartCreditsUnusedTime({ prorationBehavior: undefined })).toBe(
			true,
		);
		expect(phaseStartCreditsUnusedTime({ prorationBehavior: "none" })).toBe(
			false,
		);
	});

	test("a kept-anchor phase start with none raises no invoice; a reset always does", () => {
		expect(
			phaseStartRaisesInvoice({
				prorationBehavior: "none",
				resetsBillingCycle: false,
			}),
		).toBe(false);
		expect(
			phaseStartRaisesInvoice({
				prorationBehavior: "none",
				resetsBillingCycle: true,
			}),
		).toBe(true);
		expect(
			phaseStartRaisesInvoice({
				prorationBehavior: "prorate_immediately",
				resetsBillingCycle: false,
			}),
		).toBe(true);
		expect(
			phaseStartRaisesInvoice({
				prorationBehavior: undefined,
				resetsBillingCycle: false,
			}),
		).toBe(true);
	});
});
