import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logLicenseAction } from "@/internal/licenses/actions/logs/logLicenseAction.js";
import type { LicenseUpdateContext, LicenseUpdatePlan } from "../types.js";

export const logLicenseUpdatePlan = ({
	ctx,
	context,
	plan,
	preview,
}: {
	ctx: AutumnContext;
	context: LicenseUpdateContext;
	plan: LicenseUpdatePlan;
	preview: boolean;
}) => {
	logLicenseAction({
		ctx,
		action: preview ? "preview_update" : "update",
		details: {
			customer: context.fullCustomer.id ?? context.fullCustomer.internal_id,
			assignment: context.assignment.id,
			action: plan.action,
			endedAt: plan.endedAt ?? context.assignment.ended_at,
		},
	});
};
