import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ReconcileContext } from "../types.js";
import { computeCustomerLicenseBalancePlan } from "./computeCustomerLicenseBalancePlan.js";
import { executeCustomerLicenseBalancePlan } from "./executeCustomerLicenseBalancePlan.js";

export const reconcileCustomerLicenseBalances = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
}) => {
	const plan = computeCustomerLicenseBalancePlan({ context });
	await executeCustomerLicenseBalancePlan({ ctx, context, plan });
};
