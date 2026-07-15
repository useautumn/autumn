import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logLicenseAction } from "@/internal/licenses/actions/logs/logLicenseAction.js";
import type { AttachLicenseContext, AttachLicensePlan } from "../types.js";

export const logLicenseAssignmentPlan = ({
	ctx,
	context,
	plan,
	preview,
}: {
	ctx: AutumnContext;
	context: AttachLicenseContext;
	plan: AttachLicensePlan;
	preview: boolean;
}) => {
	const { fullCustomer, parentCustomerProduct } = context;
	logLicenseAction({
		ctx,
		action: preview ? "preview_attach" : "attach",
		details: {
			customer: fullCustomer.id ?? fullCustomer.internal_id,
			parent: parentCustomerProduct.product.id,
			entities: context.entityParams.length,
			creating: context.newEntityParams.length,
			available: plan.available,
		},
	});
};
