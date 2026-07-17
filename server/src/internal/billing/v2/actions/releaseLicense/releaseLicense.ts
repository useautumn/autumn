import type { ReleaseLicenseParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { computeReleaseLicensePlan } from "./compute/computeReleaseLicensePlan.js";
import { handleReleaseLicenseErrors } from "./errors/handleReleaseLicenseErrors.js";
import { logReleaseLicensePlan } from "./logs/logReleaseLicensePlan.js";
import { setupReleaseLicenseContext } from "./setup/setupReleaseLicenseContext.js";

export const releaseLicense = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ReleaseLicenseParamsV0;
}) => {
	// 1. Setup
	const context = await setupReleaseLicenseContext({ ctx, params });

	// 2. Errors
	handleReleaseLicenseErrors({ context });

	// 3. Compute: entity unlinks + pool returns ride the shared plan
	const plan = computeReleaseLicensePlan({ context });
	logReleaseLicensePlan({ ctx, context });

	// 4. Execute
	ctx.assertLockOwned?.();
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	// Response shape is undecided; callers only get an acknowledgement.
	return { success: true as const };
};
