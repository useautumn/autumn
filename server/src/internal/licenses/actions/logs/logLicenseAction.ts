import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";

export const logLicenseAction = ({
	ctx,
	action,
	details,
}: {
	ctx: AutumnContext;
	action: string;
	details: Record<string, unknown>;
}) => {
	addToExtraLogs({ ctx, extras: { [`licenses.${action}`]: details } });
};
