import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { logLicenseAction } from "@/internal/licenses/actions/logs/logLicenseAction.js";
import { getLicenseAssignmentResponse } from "@/internal/licenses/licenseResponseUtils.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import { computeLicenseUpdatePlan } from "./compute/computeLicenseUpdatePlan.js";
import { setupLicenseUpdateContext } from "./setup/setupLicenseUpdateContext.js";
import type { LicenseCancelAction } from "./types.js";

export const updateLicense = async ({
	ctx,
	customerId,
	assignmentId,
	cancelAction,
	preview = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	assignmentId: string;
	cancelAction: LicenseCancelAction;
	preview?: boolean;
}) => {
	// 1. Setup
	const context = await setupLicenseUpdateContext({
		ctx,
		customerId,
		assignmentId,
	});

	// 2. Compute: already-ended assignments only converge, never re-execute
	const entity = context.assignment.internal_entity_id
		? await licenseAssignmentRepo.getEntityByInternalId({
				db: ctx.db,
				internalEntityId: context.assignment.internal_entity_id,
			})
		: undefined;
	const plan = computeLicenseUpdatePlan({
		fullCustomer: context.fullCustomer,
		assignment: context.assignment,
		entityId: entity?.id ?? undefined,
		cancelAction,
	});

	logLicenseAction({
		ctx,
		action: preview ? "preview_update" : "update",
		details: {
			customer: customerId,
			assignment: assignmentId,
			action: plan.action,
			endedAt: plan.endedAt ?? context.assignment.ended_at,
		},
	});

	if (preview) {
		return {
			customer_id: customerId,
			intent: plan.endedAt
				? ("cancel_immediately" as const)
				: ("none" as const),
			assignment_id: assignmentId,
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
