import type { DfuFlashParams, DfuFlashResult } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { computeFlashPlan } from "./compute/computeFlashPlan";
import { handleFlashErrors } from "./errors/handleFlashErrors";
import { setupFlashContext } from "./setup/setupFlashContext";

/**
 * Image a customer INTO Autumn for live migration. Mirrors syncV2's tiers
 * (setup → errors → compute → execute) but is read-only against processors:
 * the DB-only executor never writes to Stripe / RevenueCat.
 */
export const flash = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DfuFlashParams;
}): Promise<DfuFlashResult> => {
	const flashContext = await setupFlashContext({ ctx, params });

	handleFlashErrors({ flashContext });

	const { autumnBillingPlan, flashed } = computeFlashPlan({
		ctx,
		flashContext,
	});

	if (!flashContext.dryRun) {
		await executeAutumnBillingPlan({ ctx, autumnBillingPlan });
	}

	return {
		customer_id: flashContext.customer_id,
		flashed,
	};
};
