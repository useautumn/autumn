import type {
	DbCustomerLicense,
	DbPlanLicense,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import type { DbLicenseAssignment } from "../../repos/licenseAssignmentRepo.js";

export type LicenseAssignmentRow = {
	assignment: DbLicenseAssignment;
	entity_id: string | null;
	license_product_id: string;
};

/** The customer's full license state, loaded once per converge: the desired
 * half (parents + definitions) and the actual half (assignments + balances).
 * Reconcile phases patch it in place as they write, so the returned state
 * always mirrors the database. */
export type CustomerLicenseState = {
	parents: FullCusProduct[];
	definitionsByParentId: Map<string, DbPlanLicense[]>;
	assignments: LicenseAssignmentRow[];
	balances: DbCustomerLicense[];
	getLicenseProduct: (licenseInternalProductId: string) => Promise<FullProduct>;
};
