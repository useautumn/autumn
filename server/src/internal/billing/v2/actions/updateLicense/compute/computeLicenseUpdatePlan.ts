import type { FullCustomer } from "@autumn/shared";
import type { DbLicenseAssignment } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type { LicenseCancelAction, LicenseUpdatePlan } from "../types.js";
import { computeLicenseCancelPlan } from "./cancel/computeLicenseCancelPlan.js";

export const computeLicenseUpdatePlan = ({
	fullCustomer,
	assignment,
	entityId,
	cancelAction,
}: {
	fullCustomer: FullCustomer;
	assignment: DbLicenseAssignment;
	entityId?: string;
	cancelAction: LicenseCancelAction;
}): LicenseUpdatePlan => {
	const intent = assignment.ended_at ? "none" : cancelAction;

	switch (intent) {
		case "none":
			return { action: "noop" };
		case "cancel_immediately":
			return computeLicenseCancelPlan({
				fullCustomer,
				assignment,
				entityId,
				cancelAction,
			});
	}
};
