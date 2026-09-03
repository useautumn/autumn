import type {
	ApiBalanceV1,
	DbUsageAlert,
	Feature,
	FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { UsageAlertMeasurementPair } from "../types/usageAlertMeasurement.js";
import { measureBalanceBasis } from "./measureBalanceBasis.js";
import { measureUsageLimitBasis } from "./measureUsageLimitBasis.js";

/** Null means dormant: nothing to measure against, so nothing can cross. */
export const measureUsageAlert = ({
	ctx,
	alert,
	feature,
	apiBalances,
	oldFullSubject,
	newFullSubject,
	now,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	apiBalances: { before: ApiBalanceV1; after: ApiBalanceV1 };
	oldFullSubject?: FullSubject;
	newFullSubject?: FullSubject;
	now: number;
}): UsageAlertMeasurementPair | null => {
	const basis = alert.basis ?? "balance";

	if (basis === "usage_limit") {
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
			now,
		});
	}

	const before = measureBalanceBasis({ basis, apiBalance: apiBalances.before });
	const after = measureBalanceBasis({ basis, apiBalance: apiBalances.after });
	return before && after ? { before, after } : null;
};
