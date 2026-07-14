import type {
	FullCusProduct,
	FullCustomer,
	FullCustomerLicense,
} from "@autumn/shared";
import type { StrandedCustomerLicense } from "../../repos/customerLicenseRepo/listAdoptableStrandedCustomerLicenses.js";
import type { DbLicenseAssignment } from "../../repos/licenseAssignmentRepo.js";

export type LicenseAssignmentRow = {
	assignment: DbLicenseAssignment;
	entity_id: string | null;
	license_product_id: string;
};

/** Everything reconcile reads, gathered once (billing-action setup shape).
 * Parents and customer licenses come straight off the FullCustomer (live
 * parents only); stranded rows come from one time-windowed query; seat
 * counts from one aggregate. Every read is bounded. */
export type ReconcileContext = {
	fullCustomer: FullCustomer;
	parentCustomerProducts: FullCusProduct[];
	customerLicenses: FullCustomerLicense[];
	strandedCustomerLicenses: StrandedCustomerLicense[];
	seatCountByCustomerLicenseId: Map<string, number>;
};

/** Post-reconcile snapshot returned to callers; mirrors the database after
 * the writes. */
export type CustomerLicenseState = {
	parentCustomerProducts: FullCusProduct[];
	customerLicenses: FullCustomerLicense[];
};
