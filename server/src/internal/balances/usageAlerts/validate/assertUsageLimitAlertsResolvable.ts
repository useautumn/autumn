import {
	type DbUsageAlertLike,
	type DbUsageLimitLike,
	ErrCode,
	filterUnresolvableUsageLimitAlerts,
	RecaseError,
	usageAlertIdentity,
} from "@autumn/shared";

// Stored alerts stay dormant when their cap goes away; only newly written alerts must resolve one.
export const assertUsageLimitAlertsResolvable = ({
	usageAlerts,
	storedUsageAlerts,
	usageLimitLists,
}: {
	usageAlerts: DbUsageAlertLike[];
	storedUsageAlerts: DbUsageAlertLike[] | null | undefined;
	usageLimitLists: Array<
		Array<Pick<DbUsageLimitLike, "feature_id" | "filter">> | null | undefined
	>;
}): void => {
	const storedIdentities = new Set(
		(storedUsageAlerts ?? []).map(usageAlertIdentity),
	);
	const orphan = filterUnresolvableUsageLimitAlerts({
		usageAlerts,
		usageLimitLists,
	}).find(
		({ usageAlert }) => !storedIdentities.has(usageAlertIdentity(usageAlert)),
	);
	if (!orphan) return;

	throw new RecaseError({
		message: `usage_alerts[${orphan.index}] uses basis usage_limit but no usage limit matches feature ${orphan.usageAlert.feature_id} and its filter`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
