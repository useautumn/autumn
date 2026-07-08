import type {
	DbPlanLicense,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import type { DbLicenseAssignment } from "./repos/licenseAssignmentRepo.js";

/** One-shot snapshot of a customer's license graph, shared across the
 * reconcile pipeline: valid parents, their resolved definitions, memoized
 * license product fetches. */
export type LicenseTopology = {
	validParents: FullCusProduct[];
	definitionsByParentId: Map<string, DbPlanLicense[]>;
	getLicenseProduct: (licenseInternalProductId: string) => Promise<FullProduct>;
};

export type LicenseDefinition = Pick<
	DbPlanLicense,
	"license_internal_product_id" | "id" | "included"
>;

/** Minimal assignment shape shared by raw rows and FullCusProduct. */
export type LicenseAssignmentCustomerProduct = Pick<
	DbLicenseAssignment,
	"id" | "created_at" | "internal_product_id"
> &
	Partial<Pick<DbLicenseAssignment, "ended_at" | "internal_entity_id">>;
