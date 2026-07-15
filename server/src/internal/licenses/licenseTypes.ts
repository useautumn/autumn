import type { DbPlanLicense } from "@autumn/shared";
import type { DbLicenseAssignment } from "./repos/licenseAssignmentRepo.js";

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
