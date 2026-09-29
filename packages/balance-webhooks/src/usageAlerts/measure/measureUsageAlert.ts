import type { CheckCommand } from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	type DbUsageAlert,
	DEFAULT_USAGE_ALERT_BASIS,
	type Feature,
} from "@autumn/shared";
import type {
	BeforeAfter,
	TrackedSubjects,
	UsageAlertMeasurement,
} from "../types/usageAlert.js";
import { measureBalanceAlert } from "./measureBalanceBasis.js";
import { measureUsageLimitAlert } from "./measureUsageLimitBasis.js";

/** What the alert reads before and after, on its basis; null when the basis cannot be read on both sides. */
export const measureUsageAlert = ({
	command,
	alert,
	feature,
	tracked,
	apiBalances,
	entityId,
}: {
	command: CheckCommand;
	alert: DbUsageAlert;
	feature: Feature;
	tracked: TrackedSubjects;
	apiBalances: BeforeAfter<ApiBalanceV1>;
	entityId?: string;
}): BeforeAfter<UsageAlertMeasurement> | null => {
	const basis = alert.basis ?? DEFAULT_USAGE_ALERT_BASIS;
	if (basis === "usage_limit") {
		return measureUsageLimitAlert({
			command,
			alert,
			feature,
			tracked,
			entityId,
		});
	}
	return measureBalanceAlert({ basis, apiBalances });
};
