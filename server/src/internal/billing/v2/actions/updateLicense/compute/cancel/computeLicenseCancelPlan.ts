import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerLicenseUpdate,
	type FullCusProduct,
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
	const { fullCustomer, assignment } = context;
	const endedAt = Date.now();
	const endAssignment = {
		customerProduct: assignment as unknown as FullCusProduct,
		updates: { status: CusProductStatus.Expired, ended_at: endedAt },
	};
	const customerLicenseUpdates: CustomerLicenseUpdate[] =
		assignment.customer_license_link_id
			? [
					{
						customerLicenseLinkId: assignment.customer_license_link_id,
						remainingChange: 1,
					},
				]
			: [];

	const billingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertCustomerProducts: [],
		updateCustomerProducts: [endAssignment],
		customerLicenseUpdates,
	};
	return { action: cancelAction, endedAt, billingPlan };
};
