import type { UpdateLicenseParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { getLicenseAssignmentResponse } from "@/internal/licenses/licenseResponseUtils.js";
import { computeLicenseUpdatePlan } from "./compute/computeLicenseUpdatePlan.js";
import { logLicenseUpdatePlan } from "./logs/logLicenseUpdatePlan.js";
import { setupLicenseUpdateContext } from "./setup/setupLicenseUpdateContext.js";

export const updateLicense = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: UpdateLicenseParams;
	preview?: boolean;
}) => {
	// 1. Setup
	const context = await setupLicenseUpdateContext({ ctx, params });

	// 2. Compute: already-ended assignments only converge, never re-execute
	const plan = computeLicenseUpdatePlan({
		context,
		cancelAction: params.cancel_action,
	});
	logLicenseUpdatePlan({ ctx, context, plan, preview });

	if (preview) {
		return {
			customer_id: params.customer_id,
			intent: plan.endedAt
				? ("cancel_immediately" as const)
				: ("none" as const),
			assignment_id: params.assignment_id,
			ended_at: plan.endedAt ?? context.assignment.ended_at,
		};
	}

	// 3. Execute: assignment end + slot release + license lifecycle
	// (converge + cache) all run inside the shared billing plan executor
	if (plan.endedAt) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: plan.billingPlan,
		});
	}

	const response = await getLicenseAssignmentResponse({
		ctx,
		assignment: context.assignment,
	});
	return plan.endedAt ? { ...response, ended_at: plan.endedAt } : response;
};
