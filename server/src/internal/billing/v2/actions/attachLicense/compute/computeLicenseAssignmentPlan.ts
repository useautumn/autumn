import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type {
	LicenseAssignmentContext,
	LicenseAssignmentPlan,
} from "../types.js";
import { buildLicenseCustomerProduct } from "./buildLicenseCustomerProduct.js";
import { resolveAssignableLicenseParent } from "./resolveAssignableLicenseParent.js";
import { validatePricedLicenseAttached } from "./validatePricedLicenseAttached.js";

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

	const { parent, licenseDefinition, available } =
		await resolveAssignableLicenseParent({
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
		licenseDefinition,
	});

	const provisioned: FullCusProduct = await buildLicenseCustomerProduct({
		ctx,
		fullCustomer,
		licenseProduct,
		licenseDefinition,
		internalEntityId: entity.internal_id,
		licenseParentCustomerProductId: parent.id,
	});
	const billingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertCustomerProducts: [provisioned],
		licenseOps: [
			{
				op: "take",
				internalCustomerId: fullCustomer.internal_id,
				parentCustomerProductId: parent.id,
				licenseInternalProductId: licenseProduct.internal_id,
				granted: licenseDefinition.included,
				entityId: entity.id ?? entity.internal_id,
			},
		],
	};

	return { parent, licenseDefinition, available, provisioned, billingPlan };
};
