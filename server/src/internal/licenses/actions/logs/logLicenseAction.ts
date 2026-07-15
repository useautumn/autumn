import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";

type LicenseLogAction =
	| "attach"
	| "release"
	| "reconcile"
	| "link"
	| "edit_items";

export const logLicenseAction = ({
	ctx,
	action,
	details,
}: {
	ctx: AutumnContext;
	action: LicenseLogAction;
	details: Record<string, unknown>;
}) => {
	addToExtraLogs({ ctx, extras: { [`licenses.${action}`]: details } });
};
