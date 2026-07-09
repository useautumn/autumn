import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logLicenseAction } from "@/internal/licenses/actions/logs/logLicenseAction.js";
import type {
	LicenseAssignmentContext,
	LicenseAssignmentPlan,
} from "../types.js";

export const logLicenseAssignmentPlan = ({
	ctx,
	context,
	plan,
	preview,
}: {
	ctx: AutumnContext;
	context: LicenseAssignmentContext;
	plan: LicenseAssignmentPlan;
	preview: boolean;
}) => {
	const base = {
		customer: context.fullCustomer.id ?? context.fullCustomer.internal_id,
		entity: context.entity.id ?? context.entity.internal_id,
	};
	logLicenseAction({
		ctx,
		action: preview ? "preview_attach" : "attach",
		details: plan.existing
			? { ...base, existing: plan.existing.id }
			: {
					...base,
					parent: plan.parent.product.id,
					available: plan.available,
				},
	});
};
