import type { Customer } from "@autumn/shared";
import type { DbLicenseAssignment } from "../../../repos/licenseAssignmentRepo.js";

export type LicenseCancelAction = "cancel_immediately";

export type LicenseUpdateContext = {
	assignment: DbLicenseAssignment;
	customer: Customer | null;
	detachCustomerId: string;
};

export type LicenseUpdatePlan =
	| { action: LicenseCancelAction; endedAt: number }
	| { action: "noop"; endedAt?: undefined };
