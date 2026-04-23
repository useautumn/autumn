import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AlertCategory, AlertSeverity } from "./loggerTypes.js";

export const logAlertEvent = ({
	ctx,
	severity,
	category,
	alertKey,
	message,
	source,
	component,
	data,
}: {
	ctx: AutumnContext;
	severity: AlertSeverity;
	category: AlertCategory;
	alertKey: string;
	message: string;
	source: string;
	component: string;
	data: Record<string, unknown>;
}) => {
	ctx.logger.warn(message, {
		type: "alert_event",
		alert_key: alertKey,
		severity,
		category,
		source,
		component,
		data,
	});
};
