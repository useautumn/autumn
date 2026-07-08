import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLicenseAssignmentResponse } from "../../../licenseResponseUtils.js";
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
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	planId: string;
	poolId?: string;
	parentSubscriptionId?: string;
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
	if (plan.existing) {
		return await getLicenseAssignmentResponse({
			ctx,
			assignment: plan.existing,
		});
	}

	// 3. Execute
	const assignment = await executeLicenseAssignment({ ctx, context, plan });

	// 4. Converge
	await afterLicenseMutation({
		ctx,
		customerId: context.fullCustomer.id ?? undefined,
		internalCustomerId: context.fullCustomer.internal_id,
		entityId,
	});

	return await getLicenseAssignmentResponse({ ctx, assignment });
};
