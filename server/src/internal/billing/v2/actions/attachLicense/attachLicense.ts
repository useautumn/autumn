import type { LicenseAttachParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { serializeLicenseAssignment } from "@/internal/licenses/licenseResponseUtils.js";
import { computeLicenseAssignmentPlan } from "./compute/computeLicenseAssignmentPlan.js";
import { logLicenseAssignmentPlan } from "./logs/logLicenseAssignmentPlan.js";
import { setupLicenseAssignmentContext } from "./setup/setupLicenseAssignmentContext.js";

export const attachLicense = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: LicenseAttachParams;
	preview?: boolean;
}) => {
	// 1. Setup
	const context = await setupLicenseAssignmentContext({ ctx, params });

	// 2. Compute
	const plan = computeLicenseAssignmentPlan({ context });
	logLicenseAssignmentPlan({ ctx, context, plan, preview });

	if (plan.existing) {
		const assignment = serializeLicenseAssignment({
			assignment: plan.existing,
			entityId: context.entity.id ?? context.entity.internal_id,
			licenseProductId: context.licenseProduct.id,
		});
		return preview
			? { customer_id: params.customer_id, intent: "none" as const, assignment }
			: assignment;
	}
	if (preview) {
		return {
			customer_id: params.customer_id,
			intent: "assign" as const,
			parent_plan_id: plan.parent.product.id,
			license_plan_id: params.plan_id,
			available: plan.available,
		};
	}

	// 3. Execute: capacity take + provision insert + license lifecycle
	// (converge + cache) all run inside the shared billing plan executor
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	return serializeLicenseAssignment({
		assignment: plan.provisioned,
		entityId: context.entity.id ?? context.entity.internal_id,
		licenseProductId: context.licenseProduct.id,
	});
};
