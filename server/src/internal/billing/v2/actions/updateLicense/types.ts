import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { DbLicenseAssignment } from "@/internal/licenses/repos/licenseAssignmentRepo.js";

export type LicenseCancelAction = "cancel_immediately";

export type LicenseUpdateContext = {
	fullCustomer: FullCustomer;
	assignment: DbLicenseAssignment;
	entityExternalId?: string;
};

export type LicenseUpdatePlan =
	| {
			action: LicenseCancelAction;
			endedAt: number;
			billingPlan: AutumnBillingPlan;
	  }
	| { action: "noop"; endedAt?: undefined };
