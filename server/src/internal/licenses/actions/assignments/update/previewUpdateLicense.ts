import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logLicenseAction } from "../../logs/logLicenseAction.js";
import { computeLicenseUpdatePlan } from "./computeLicenseUpdatePlan.js";
import { setupLicenseUpdateContext } from "./setupLicenseUpdateContext.js";
import type { LicenseCancelAction } from "./types.js";

export const previewUpdateLicense = async ({
	ctx,
	customerId,
	assignmentId,
	cancelAction,
}: {
	ctx: AutumnContext;
	customerId: string;
	assignmentId: string;
	cancelAction: LicenseCancelAction;
}) => {
	// 1. Setup
	const context = await setupLicenseUpdateContext({
		ctx,
		customerId,
		assignmentId,
	});

	// 2. Compute only — previews never execute or converge
	const plan = computeLicenseUpdatePlan({
		assignment: context.assignment,
		cancelAction,
	});
	logLicenseAction({
		ctx,
		action: "preview_update",
		details: {
			customer: customerId,
			assignment: assignmentId,
			action: plan.action,
			endedAt: plan.endedAt ?? context.assignment.ended_at,
		},
	});

	return {
		customer_id: customerId,
		intent: plan.endedAt ? ("cancel_immediately" as const) : ("none" as const),
		assignment_id: assignmentId,
		ended_at: plan.endedAt ?? context.assignment.ended_at,
	};
};
