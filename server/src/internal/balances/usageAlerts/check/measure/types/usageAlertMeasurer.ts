import type { ApiBalanceV1, DbUsageAlert, Feature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TrackedSubjects } from "../../types/trackedSubjects.js";
import type { UsageAlertMeasurementPair } from "../../types/usageAlertMeasurement.js";

export type MeasureUsageAlertParams = {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	tracked: TrackedSubjects;
	apiBalances: { before: ApiBalanceV1; after: ApiBalanceV1 };
};

export type UsageAlertMeasurer = (
	params: MeasureUsageAlertParams,
) => UsageAlertMeasurementPair | null;
