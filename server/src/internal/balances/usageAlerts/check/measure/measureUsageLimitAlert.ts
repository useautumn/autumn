import { measureUsageLimitBasis } from "./measureUsageLimitBasis.js";
import type { UsageAlertMeasurer } from "./types/usageAlertMeasurer.js";

export const measureUsageLimitAlert: UsageAlertMeasurer = ({
	ctx,
	alert,
	feature,
	tracked,
}) => {
	const oldFullSubject = tracked.before.fullSubject;
	const newFullSubject = tracked.after.fullSubject;
	if (!oldFullSubject || !newFullSubject) {
		ctx.logger.info(
			`[usageAlerts] usage_limit alert on feature ${feature.id} skipped: this deduction path carries no usage windows`,
		);
		return null;
	}
	return measureUsageLimitBasis({
		ctx,
		alert,
		feature,
		oldFullSubject,
		newFullSubject,
	});
};
