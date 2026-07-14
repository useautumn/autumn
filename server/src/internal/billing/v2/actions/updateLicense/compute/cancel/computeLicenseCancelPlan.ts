import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type LicenseOp,
} from "@autumn/shared";
import type {
	LicenseCancelAction,
	LicenseUpdateContext,
	LicenseUpdatePlan,
} from "../../types.js";

export const computeLicenseCancelPlan = ({
	context,
	cancelAction,
}: {
	context: LicenseUpdateContext;
	cancelAction: LicenseCancelAction;
}): LicenseUpdatePlan => {
	const { fullCustomer, assignment, entityExternalId } = context;
	const endedAt = Date.now();
	const endAssignment = {
		customerProduct: assignment as unknown as FullCusProduct,
		updates: { status: CusProductStatus.Expired, ended_at: endedAt },
	};
	const releaseOps: LicenseOp[] = assignment.license_parent_customer_product_id
		? [
				{
					op: "release",
					internalCustomerId: assignment.internal_customer_id,
					parentCustomerProductId:
						assignment.license_parent_customer_product_id,
					licenseInternalProductId: assignment.internal_product_id,
					granted: 0,
					entityId: entityExternalId,
					customerLicenseId: assignment.customer_license_id,
				},
			]
		: [];

	const billingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertCustomerProducts: [],
		updateCustomerProducts: [endAssignment],
		licenseOps: releaseOps,
	};
	return { action: cancelAction, endedAt, billingPlan };
};
