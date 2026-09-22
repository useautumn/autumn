import type {
	CheckCommand,
	WorkerFullSubject,
	WorkerUsageWindow,
} from "@autumn/balance-engine";
import {
	type DbUsageAlert,
	type Feature,
	fullSubjectToCustomerEntitlements,
	fullSubjectToUsageWindowLimits,
	getCurrentUsageWindowUsage,
	orgToInStatuses,
	type UsageWindowLimit,
	usageLimitFilterKey,
	usageWindowLimitToWebhookBlock,
} from "@autumn/shared";
import type {
	BeforeAfter,
	TrackedSubjects,
	UsageAlertMeasurement,
} from "../types/usageAlert.js";

/** The usage_limit basis: what an alert reads off the cap's window, the cap being the one with its feature and filter. */

export const usageWindowLimitToUsageAlertMeasurement = ({
	limit,
	usageWindows,
	now,
}: {
	limit: UsageWindowLimit;
	usageWindows: WorkerUsageWindow[];
	now: number;
}): UsageAlertMeasurement | null => {
	const usage = getCurrentUsageWindowUsage({ usageWindows, limit, now });
	const block = usageWindowLimitToWebhookBlock({ limit, usage });
	if (!block) return null;

	return {
		usage,
		denominator: limit.limit > 0 ? limit.limit : null,
		remaining: block.remaining,
		periodStartAt: limit.window_start_at,
		payloadBlock: { basis: "usage_limit", usage_limit: block },
	};
};

// Customer-scope alerts read customer counters only; an entity override cap belongs to entity-scope alerts.
const findUsageWindowLimitForAlert = ({
	command,
	alert,
	feature,
	fullSubject,
	entityId,
}: {
	command: CheckCommand;
	alert: DbUsageAlert;
	feature: Feature;
	fullSubject: WorkerFullSubject;
	entityId?: string;
}): UsageWindowLimit | undefined => {
	const filterKey = usageLimitFilterKey(alert.filter);
	const readsCustomerCountersOnly = !entityId;
	const now = command.occurredAt;
	const features = fullSubjectToCustomerEntitlements({ fullSubject, now }).map(
		(customerEntitlement) => customerEntitlement.entitlement.feature,
	);
	return fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: [feature.id],
		features,
		now,
		inStatuses: orgToInStatuses({ org: command.org }),
	}).find(
		(limit) =>
			(limit.filter_key ?? "") === filterKey &&
			(!readsCustomerCountersOnly || limit.scope_type === "customer"),
	);
};

// One limit at one now: a window that rolled between the subjects reads 0 on the old side.
export const measureUsageLimitAlert = ({
	command,
	alert,
	feature,
	tracked,
	entityId,
}: {
	command: CheckCommand;
	alert: DbUsageAlert;
	feature: Feature;
	tracked: TrackedSubjects;
	entityId?: string;
}): BeforeAfter<UsageAlertMeasurement> | null => {
	const limit = findUsageWindowLimitForAlert({
		command,
		alert,
		feature,
		fullSubject: tracked.after,
		entityId,
	});
	if (!limit) return null;

	const now = command.occurredAt;
	const before = usageWindowLimitToUsageAlertMeasurement({
		limit,
		usageWindows: tracked.before.usage_windows,
		now,
	});
	const after = usageWindowLimitToUsageAlertMeasurement({
		limit,
		usageWindows: tracked.after.usage_windows,
		now,
	});
	const measuredBothSides = before !== null && after !== null;
	return measuredBothSides ? { before, after } : null;
};
