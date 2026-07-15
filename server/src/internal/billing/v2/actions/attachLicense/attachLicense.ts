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
	preview = false,
}: {
	ctx: AutumnContext;
	params: AttachLicenseParamsV0;
	preview?: boolean;
}) => {
	// 1. Setup
	const context = await setupAttachLicenseContext({ ctx, params });
	const licensePlanId = context.customerLicense.planLicense.product.id;

	// 2. Errors
	handleAttachLicenseErrors({ context });

	// 3. Compute
	const plan = computeAttachLicensePlan({ ctx, context });
	logLicenseAssignmentPlan({ ctx, context, plan, preview });

	if (preview) {
		return {
			customer_id: params.customer_id,
			intent: "assign" as const,
			parent_plan_id: context.parentCustomerProduct.product.id,
			license_plan_id: licensePlanId,
			available: plan.available,
		};
	}

	// 4. Execute: entity upserts + capacity take + provision inserts +
	// license lifecycle (converge + cache) all run inside the shared executor
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	// Response shape is undecided; callers only get an acknowledgement.
	return { success: true as const };
};
