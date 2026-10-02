import { expect, test } from "bun:test";
import { phaseResetsBillingCycle } from "@/internal/billing/v2/actions/generateRequest/setup/phaseResetsBillingCycle";

const PHASE_START_MS = 1_790_939_142_802;
const PHASE_START_SECONDS = 1_790_939_142_000;

test("an exact-ms anchor resets the cycle at a phase start stored at Stripe's second precision", () => {
	expect(
		phaseResetsBillingCycle({
			billingCycleAnchorResetsAt: PHASE_START_MS,
			phaseStartsAt: PHASE_START_SECONDS,
		}),
	).toBe(true);
});

test("an anchor at a different second does not reset the cycle at the phase start", () => {
	expect(
		phaseResetsBillingCycle({
			billingCycleAnchorResetsAt: PHASE_START_MS + 1000,
			phaseStartsAt: PHASE_START_SECONDS,
		}),
	).toBe(false);
	expect(
		phaseResetsBillingCycle({
			billingCycleAnchorResetsAt: null,
			phaseStartsAt: PHASE_START_SECONDS,
		}),
	).toBe(false);
});
