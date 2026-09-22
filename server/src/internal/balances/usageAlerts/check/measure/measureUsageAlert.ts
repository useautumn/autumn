import {
	type BeforeAfter,
	measureBalanceAlert,
	type UsageAlertMeasurement,
} from "@autumn/balance-webhooks";
import {
	type ApiBalanceV1,
	type DbUsageAlert,
	DEFAULT_USAGE_ALERT_BASIS,
	type Feature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TrackedSubjects } from "../types/trackedSubjects.js";
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
	const basis = alert.basis ?? DEFAULT_USAGE_ALERT_BASIS;
	if (basis === "usage_limit") {
		return measureUsageLimitAlert({ ctx, alert, feature, tracked, entityId });
	}
	return measureBalanceAlert({ basis, apiBalances });
};
