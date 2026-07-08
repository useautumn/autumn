import type {
	AutumnBillingPlan,
	DbPlanLicense,
	Entity,
	FullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import type { DbLicenseAssignment } from "@/internal/licenses/repos/licenseAssignmentRepo.js";

export type LicenseAssignmentContext = {
	fullCustomer: FullCustomer;
	entity: Entity;
	licenseProduct: FullProduct;
	planId: string;
	parentPlanId?: string;
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
