import type {
	AutumnBillingPlan,
	DbCustomerProduct,
	DbPlanLicense,
	Entity,
	FullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import type { DbLicenseAssignment } from "@/internal/licenses/repos/licenseAssignmentRepo.js";

/** Everything the assignment resolves to — computed in setup so compute is a
 * pure plan assembly. Either an existing active assignment (idempotent), or a
 * fully resolved new assignment. */
export type LicenseAssignmentResolution =
	| { existing: DbLicenseAssignment }
	| {
			existing?: undefined;
			parent: FullCusProduct;
			licenseDefinition: DbPlanLicense;
			effectiveProduct: FullProduct;
			available: number;
			provisioned: FullCusProduct;
	  };

export type LicenseAssignmentContext = {
	fullCustomer: FullCustomer;
	entity: Entity;
	licenseProduct: FullProduct;
	customerLevelProduct?: DbCustomerProduct;
	planId: string;
	parentPlanId?: string;
	resolution: LicenseAssignmentResolution;
};

export type LicenseAssignmentPlan =
	| { existing: DbLicenseAssignment }
	| {
			existing?: undefined;
			parent: FullCusProduct;
			licenseDefinition: DbPlanLicense;
			available: number;
			provisioned: FullCusProduct;
			billingPlan: AutumnBillingPlan;
	  };
