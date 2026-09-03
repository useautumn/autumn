import type { DbUsageAlert, Feature } from "@autumn/shared";

const isAlertForFeature = ({
	alert,
	feature,
}: {
	alert: DbUsageAlert;
	feature: Feature;
}) => alert.feature_id === feature.id || !alert.feature_id;

export const filterUsageAlertsForFeature = ({
	alerts,
	feature,
}: {
	alerts: DbUsageAlert[];
	feature: Feature;
}): DbUsageAlert[] =>
	alerts.filter((alert) => isAlertForFeature({ alert, feature }));

export const filterEnabledUsageAlertsForFeature = ({
	alerts,
	feature,
}: {
	alerts: DbUsageAlert[];
	feature: Feature;
}): DbUsageAlert[] =>
	filterUsageAlertsForFeature({ alerts, feature }).filter(
		(alert) => alert.enabled,
	);
