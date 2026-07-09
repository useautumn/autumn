import type {
	LicenseCancelAction,
	LicenseUpdateContext,
	LicenseUpdatePlan,
} from "../types.js";
import { computeLicenseCancelPlan } from "./cancel/computeLicenseCancelPlan.js";

export const computeLicenseUpdatePlan = ({
	context,
	cancelAction,
}: {
	context: LicenseUpdateContext;
	cancelAction: LicenseCancelAction;
}): LicenseUpdatePlan => {
	const intent = context.assignment.ended_at ? "none" : cancelAction;

	switch (intent) {
		case "none":
			return { action: "noop" };
		case "cancel_immediately":
			return computeLicenseCancelPlan({ context, cancelAction });
	}
};
