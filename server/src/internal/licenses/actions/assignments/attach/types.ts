import type {
	DbPlanLicense,
	Entity,
	FullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import type { DbLicenseAssignment } from "../../../repos/licenseAssignmentRepo.js";

export type LicenseAssignmentContext = {
	fullCustomer: FullCustomer;
	entity: Entity;
	licenseProduct: FullProduct;
	planId: string;
	poolId?: string;
	parentSubscriptionId?: string;
};

export type LicenseAssignmentPlan =
	| { existing: DbLicenseAssignment }
	| {
			existing?: undefined;
			parent: FullCusProduct;
			licenseDefinition: DbPlanLicense;
	  };
