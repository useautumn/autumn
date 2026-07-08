import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLicenseAssignmentResponse } from "../../../licenseResponseUtils.js";
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
	poolId,
	parentSubscriptionId,
	preview = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	planId: string;
	poolId?: string;
	parentSubscriptionId?: string;
	preview?: boolean;
}) => {
	// 1. Setup
	const context = await setupLicenseAssignmentContext({
		ctx,
		params: {
			customer_id: customerId,
			entity_id: entityId,
			plan_id: planId,
			pool_id: poolId,
			parent_subscription_id: parentSubscriptionId,
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
					pool: plan.parent.id,
					available: plan.available,
				},
	});

	if (plan.existing) {
		const assignment = await getLicenseAssignmentResponse({
			ctx,
			assignment: plan.existing,
		});
		return preview
			? { customer_id: customerId, intent: "none" as const, assignment }
			: assignment;
	}
	if (preview) {
		return {
			customer_id: customerId,
			intent: "assign" as const,
			pool_id: plan.parent.id,
			license_plan_id: planId,
			available: plan.available,
		};
	}

	// 3. Execute
	const assignment = await executeLicenseAssignment({ ctx, context, plan });

	// 4. Converge: balances + billing carriers (pool-level charging lives in
	// the shared reconcile, reacting to assignment state like every mutation)
	await afterLicenseMutation({
		ctx,
		customerId: context.fullCustomer.id ?? undefined,
		internalCustomerId: context.fullCustomer.internal_id,
		entityId,
	});

	return await getLicenseAssignmentResponse({ ctx, assignment });
};
