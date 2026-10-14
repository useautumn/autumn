import type { AttachLicenseParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
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
	const context = await setupAttachLicenseContext({ ctx, params });

	handleAttachLicenseErrors({ context });

	const plan = computeAttachLicensePlan({ ctx, context });
	logLicenseAssignmentPlan({ ctx, context, plan });

	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	return { success: true as const };
};
