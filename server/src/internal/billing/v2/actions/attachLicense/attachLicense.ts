import type { AttachLicenseParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { computeAttachLicensePlan } from "./compute/computeAttachLicensePlan.js";
import { handleAttachLicenseErrors } from "./errors/handleAttachLicenseErrors.js";
import { logLicenseAssignmentPlan } from "./logs/logLicenseAssignmentPlan.js";
import { setupAttachLicenseContext } from "./setup/setupAttachLicenseContext.js";

export const attachLicense = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: AttachLicenseParamsV0;
}) => {
	// 1. Setup
	const context = await setupAttachLicenseContext({ ctx, params });

	// 2. Errors
	handleAttachLicenseErrors({ context });
	if (
		context.existingEntities.length === 0 &&
		context.newEntityParams.length === 0
	) {
		return { success: true as const };
	}

	// 3. Compute
	const plan = computeAttachLicensePlan({ ctx, context });
	logLicenseAssignmentPlan({ ctx, context, plan });

	// 4. Execute: entity upserts + capacity take + provision inserts +
	// license lifecycle (converge + cache) all run inside the shared executor
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	// Response shape is undecided; callers only get an acknowledgement.
	return { success: true as const };
};
