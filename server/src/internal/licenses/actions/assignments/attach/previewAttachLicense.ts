import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { serializeLicenseAssignment } from "../../../licenseResponseUtils.js";
import { logLicenseAction } from "../../logs/logLicenseAction.js";
import { computeLicenseAssignmentPlan } from "./computeLicenseAssignmentPlan.js";
import { setupLicenseAssignmentContext } from "./setupLicenseAssignmentContext.js";

export const previewAttachLicense = async ({
	ctx,
	customerId,
	entityId,
	planId,
	parentPlanId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	planId: string;
	parentPlanId?: string;
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

	// 2. Compute only — previews never execute or converge
	const plan = await computeLicenseAssignmentPlan({ ctx, context });
	logLicenseAction({
		ctx,
		action: "preview_attach",
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
		return {
			customer_id: customerId,
			intent: "none" as const,
			assignment: serializeLicenseAssignment({
				assignment: plan.existing,
				entityId: context.entity.id ?? context.entity.internal_id,
				licenseProductId: context.licenseProduct.id,
			}),
		};
	}
	return {
		customer_id: customerId,
		intent: "assign" as const,
		parent_plan_id: plan.parent.product.id,
		license_plan_id: planId,
		available: plan.available,
	};
};
