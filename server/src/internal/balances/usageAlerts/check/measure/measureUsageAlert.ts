import type { ApiBalanceV1, DbUsageAlert, Feature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BeforeAfter } from "../types/beforeAfter.js";
import type { TrackedSubjects } from "../types/trackedSubjects.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";
import { measureBalanceAlert } from "./measureBalanceAlert.js";
import { measureUsageLimitAlert } from "./measureUsageLimitAlert.js";

export const measureUsageAlert = ({
	ctx,
	alert,
	feature,
	tracked,
	apiBalances,
	entityId,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	tracked: TrackedSubjects;
	apiBalances: BeforeAfter<ApiBalanceV1>;
	entityId?: string;
}): BeforeAfter<UsageAlertMeasurement> | null => {
	const basis = alert.basis ?? "balance";
	if (basis === "usage_limit") {
		return measureUsageLimitAlert({ ctx, alert, feature, tracked, entityId });
	}
	return measureBalanceAlert({ basis, apiBalances });
};
