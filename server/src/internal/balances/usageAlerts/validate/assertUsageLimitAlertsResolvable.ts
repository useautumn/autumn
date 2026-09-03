import {
	type DbUsageAlertLike,
	type DbUsageLimitLike,
	ErrCode,
	findUnresolvableUsageLimitAlerts,
	RecaseError,
} from "@autumn/shared";

export const assertUsageLimitAlertsResolvable = ({
	usageAlerts,
	usageLimitLists,
}: {
	usageAlerts: DbUsageAlertLike[];
	usageLimitLists: Array<
		Array<Pick<DbUsageLimitLike, "feature_id" | "filter">> | null | undefined
	>;
}): void => {
	const orphan = findUnresolvableUsageLimitAlerts({
		usageAlerts,
		usageLimitLists,
	})[0];
	if (!orphan) return;

	throw new RecaseError({
		message: `usage_alerts[${orphan.index}] uses basis usage_limit but no usage limit matches feature ${orphan.usageAlert.feature_id ?? "(any)"} and its filter`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
