import type { DfuFlashParams, DfuFlashResult } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { getApiCustomerByRollout } from "@/internal/customers/actions/getApiCustomerByRollout";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { computeFlashPlan } from "./compute/computeFlashPlan";
import { handleFlashErrors } from "./errors/handleFlashErrors";
import { setupFlashContext } from "./setup/setupFlashContext";

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

	const customerId = flashContext.customer_id;
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "billing.import",
		skipGuard: true,
	});
	const customer = await getApiCustomerByRollout({
		disableReplicaRead: true,
		ctx,
		customerId,
		source: "billing.import",
	});

	return {
		customer_id: flashContext.customer_id,
		flashed,
		customer,
	};
};
