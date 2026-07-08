import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { logLicenseAction } from "@/internal/licenses/actions/logs/logLicenseAction.js";
import { serializeLicenseAssignment } from "@/internal/licenses/licenseResponseUtils.js";
import { computeLicenseAssignmentPlan } from "./compute/computeLicenseAssignmentPlan.js";
import { setupLicenseAssignmentContext } from "./setup/setupLicenseAssignmentContext.js";

export const attachLicense = async ({
	ctx,
	customerId,
	entityId,
	planId,
	parentPlanId,
	preview = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	planId: string;
	parentPlanId?: string;
	preview?: boolean;
}) => {
	// 1. Setup
	const context = await setupLicenseAssignmentContext({
		ctx,
		params: {
			customer_id: customerId,
			entity_id: entityId,
			plan_id: planId,
			parent_plan_id: parentPlanId,
		},
	});

	// 2. Compute
	const plan = await computeLicenseAssignmentPlan({ ctx, context });
	logLicenseAction({
		ctx,
		action: preview ? "preview_attach" : "attach",
		details: plan.existing
			? { customer: customerId, entity: entityId, existing: plan.existing.id }
			: {
					customer: customerId,
					entity: entityId,
					parent: plan.parent.product.id,
					available: plan.available,
				},
	});

	if (plan.existing) {
		const assignment = serializeLicenseAssignment({
			assignment: plan.existing,
			entityId: context.entity.id ?? context.entity.internal_id,
			licenseProductId: context.licenseProduct.id,
		});
		return preview
			? { customer_id: customerId, intent: "none" as const, assignment }
			: assignment;
	}
	if (preview) {
		return {
			customer_id: customerId,
			intent: "assign" as const,
			parent_plan_id: plan.parent.product.id,
			license_plan_id: planId,
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
