import type { ReleaseLicenseParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
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
	const context = await setupReleaseLicenseContext({ ctx, params });

	handleReleaseLicenseErrors({ context });

	const plan = computeReleaseLicensePlan({ context });
	logReleaseLicensePlan({ ctx, context });

	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	return { success: true as const };
};
