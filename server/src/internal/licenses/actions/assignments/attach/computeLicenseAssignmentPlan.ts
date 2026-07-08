import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";
import { resolveAssignableLicenseParent } from "../utils/resolveAssignableLicenseParent.js";
import { validatePricedLicenseAttached } from "../utils/validatePricedLicenseAttached.js";
import type {
	LicenseAssignmentContext,
	LicenseAssignmentPlan,
} from "./types.js";

export const computeLicenseAssignmentPlan = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: LicenseAssignmentContext;
}): Promise<LicenseAssignmentPlan> => {
	const { fullCustomer, entity, licenseProduct } = context;
	const existing = await licenseAssignmentRepo.findActiveAssignment({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: entity.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
	});
	if (existing) return { existing };

	const plan = await resolveAssignableLicenseParent({
		ctx,
		fullCustomer,
		licenseProduct,
		planId: context.planId,
		parentPlanId: context.parentPlanId,
	});
	await validatePricedLicenseAttached({
		ctx,
		fullCustomer,
		licenseProduct,
		licenseDefinition: plan.licenseDefinition,
	});
	return plan;
};
