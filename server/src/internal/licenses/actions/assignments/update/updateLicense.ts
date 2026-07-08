import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLicenseAssignmentResponse } from "../../../licenseResponseUtils.js";
import { logLicenseAction } from "../../logs/logLicenseAction.js";
import { afterLicenseMutation } from "../../reconcile/afterLicenseMutation.js";
import { computeLicenseUpdatePlan } from "./computeLicenseUpdatePlan.js";
import { executeLicenseUpdate } from "./executeLicenseUpdate.js";
import { setupLicenseUpdateContext } from "./setupLicenseUpdateContext.js";
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
	const plan = computeLicenseUpdatePlan({
		assignment: context.assignment,
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

	// 3. Execute
	if (plan.endedAt) {
		await executeLicenseUpdate({ ctx, context, plan });
	}

	const response = await getLicenseAssignmentResponse({
		ctx,
		assignment: context.assignment,
	});

	// 4. Converge
	await afterLicenseMutation({
		ctx,
		customerId: context.fullCustomer.id ?? undefined,
		internalCustomerId: context.fullCustomer.internal_id,
		entityId: response.entity_id,
	});

	return plan.endedAt ? { ...response, ended_at: plan.endedAt } : response;
};
