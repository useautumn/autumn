import type { FullCustomer } from "@autumn/shared";
import type { DbLicenseAssignment } from "../../../repos/licenseAssignmentRepo.js";

export type LicenseCancelAction = "cancel_immediately";

export type LicenseUpdateContext = {
	fullCustomer: FullCustomer;
	assignment: DbLicenseAssignment;
};

export type LicenseUpdatePlan =
	| { action: LicenseCancelAction; endedAt: number }
	| { action: "noop"; endedAt?: undefined };
