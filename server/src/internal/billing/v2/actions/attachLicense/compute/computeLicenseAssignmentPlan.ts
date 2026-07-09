import type { AutumnBillingPlan } from "@autumn/shared";
import type {
	LicenseAssignmentContext,
	LicenseAssignmentPlan,
} from "../types.js";
import { validatePricedLicenseAttached } from "./validatePricedLicenseAttached.js";

export const computeLicenseAssignmentPlan = ({
	context,
}: {
	context: LicenseAssignmentContext;
}): LicenseAssignmentPlan => {
	const { fullCustomer, entity, licenseProduct, resolution } = context;
	if (resolution.existing) return { existing: resolution.existing };

	const {
		parent,
		licenseDefinition,
		effectiveProduct,
		available,
		provisioned,
	} = resolution;
	validatePricedLicenseAttached({
		effectiveProduct,
		customerLevelProduct: context.customerLevelProduct,
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
