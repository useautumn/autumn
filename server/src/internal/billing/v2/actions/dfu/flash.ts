import type { DfuFlashParams, DfuFlashResult } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { getApiCustomerByRollout } from "@/internal/customers/actions/getApiCustomerByRollout";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
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

	if (flashContext.dryRun) {
		return {
			customer_id: flashContext.customer_id,
			flashed,
			customer: null,
		};
	}

	await executeAutumnBillingPlan({ ctx, autumnBillingPlan });

	// Drop the pre-flash cache so the returned customer reflects the just-imaged state.
	const customerId = flashContext.customer_id;
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "dfu.flash",
		skipGuard: true,
	});
	const customer = await getApiCustomerByRollout({
		ctx,
		customerId,
		source: "dfu.flash",
	});

	return {
		customer_id: flashContext.customer_id,
		flashed,
		customer,
	};
};
