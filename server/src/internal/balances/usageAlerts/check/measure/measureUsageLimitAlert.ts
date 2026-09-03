import type { DbUsageAlert, Feature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BeforeAfter } from "../types/beforeAfter.js";
import type { TrackedSubjects } from "../types/trackedSubjects.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";
import { findUsageWindowLimitForAlert } from "./findUsageWindowLimitForAlert.js";
import { usageWindowLimitToUsageAlertMeasurement } from "./usageWindowLimitToUsageAlertMeasurement.js";

// One limit at one now: a window that rolled between the subjects reads 0 on the old side.
export const measureUsageLimitAlert = ({
	ctx,
	alert,
	feature,
	tracked,
	entityId,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	tracked: TrackedSubjects;
	entityId?: string;
}): BeforeAfter<UsageAlertMeasurement> | null => {
	const oldFullSubject = tracked.before.fullSubject;
	const newFullSubject = tracked.after.fullSubject;
	if (!oldFullSubject || !newFullSubject) {
		ctx.logger.info(
			`[usageAlerts] usage_limit alert on feature ${feature.id} skipped: this deduction path carries no usage windows`,
		);
		return null;
	}

	const limit = findUsageWindowLimitForAlert({
		ctx,
		alert,
		feature,
		fullSubject: newFullSubject,
		entityId,
	});
	if (!limit) return null;

	const now = ctx.timestamp;
	const before = usageWindowLimitToUsageAlertMeasurement({
		limit,
		usageWindows: oldFullSubject.usage_windows ?? [],
		now,
	});
	const after = usageWindowLimitToUsageAlertMeasurement({
		limit,
		usageWindows: newFullSubject.usage_windows ?? [],
		now,
	});
	const measuredBothSides = before !== null && after !== null;
	return measuredBothSides ? { before, after } : null;
};
