import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type LicenseOp,
} from "@autumn/shared";
import type { DbLicenseAssignment } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type { LicenseCancelAction, LicenseUpdatePlan } from "../../types.js";

export const computeLicenseCancelPlan = ({
	fullCustomer,
	assignment,
	entityId,
	cancelAction,
}: {
	fullCustomer: FullCustomer;
	assignment: DbLicenseAssignment;
	entityId?: string;
	cancelAction: LicenseCancelAction;
}): LicenseUpdatePlan => {
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
					entityId,
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
