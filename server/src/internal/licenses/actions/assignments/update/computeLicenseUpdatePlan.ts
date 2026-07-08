import type { DbLicenseAssignment } from "../../../repos/licenseAssignmentRepo.js";
import type { LicenseCancelAction, LicenseUpdatePlan } from "./types.js";

export const computeLicenseUpdatePlan = ({
	assignment,
	cancelAction,
}: {
	assignment: DbLicenseAssignment;
	cancelAction: LicenseCancelAction;
}): LicenseUpdatePlan => {
	if (assignment.ended_at) return { action: "noop" };
	return { action: cancelAction, endedAt: Date.now() };
};
