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

export type ReconcileContext = {
	fullCustomer: FullCustomer;
	parentCustomerProducts: FullCusProduct[];
	customerLicenses: FullCustomerLicense[];
	strandedCustomerLicenses: StrandedCustomerLicense[];
	seatCountByCustomerLicenseId: Map<string, number>;
};

export type CustomerLicenseState = {
	parentCustomerProducts: FullCusProduct[];
	customerLicenses: FullCustomerLicense[];
};
