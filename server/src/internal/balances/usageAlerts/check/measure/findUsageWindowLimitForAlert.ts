import {
	type DbUsageAlert,
	type Feature,
	type FullSubject,
	type UsageWindowLimit,
	usageLimitFilterKey,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveUsageWindowLimits } from "@/internal/balances/utils/usageWindows/resolveUsageWindowLimits.js";

export const findUsageWindowLimitForAlert = ({
	ctx,
	alert,
	feature,
	fullSubject,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	fullSubject: FullSubject;
}): UsageWindowLimit | undefined => {
	const filterKey = usageLimitFilterKey(alert.filter);
	return resolveUsageWindowLimits({
		ctx,
		fullSubject,
		featureIds: [feature.id],
	}).find((limit) => (limit.filter_key ?? "") === filterKey);
};
