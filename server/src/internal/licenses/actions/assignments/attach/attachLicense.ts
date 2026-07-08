import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { serializeLicenseAssignment } from "../../../licenseResponseUtils.js";
import { logLicenseAction } from "../../logs/logLicenseAction.js";
import { afterLicenseMutation } from "../../reconcile/afterLicenseMutation.js";
import { computeLicenseAssignmentPlan } from "./computeLicenseAssignmentPlan.js";
import { executeLicenseAssignment } from "./executeLicenseAssignment.js";
import { setupLicenseAssignmentContext } from "./setupLicenseAssignmentContext.js";

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

	// 3. Execute
	const assignment = await executeLicenseAssignment({ ctx, context, plan });

	// 4. Converge: repairs stranded assignments and balances; assignment
	// itself never bills
	await afterLicenseMutation({
		ctx,
		customerId: context.fullCustomer.id ?? undefined,
		internalCustomerId: context.fullCustomer.internal_id,
		entityId,
	});

	return serializeLicenseAssignment({
		assignment,
		entityId: context.entity.id ?? context.entity.internal_id,
		licenseProductId: context.licenseProduct.id,
	});
};
