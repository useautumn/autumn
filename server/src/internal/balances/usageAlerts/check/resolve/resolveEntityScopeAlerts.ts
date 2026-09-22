import {
	filterUsageAlertsForFeature,
	type ScopedUsageAlerts,
} from "@autumn/balance-webhooks";
import type { Feature, FullCustomer } from "@autumn/shared";

export const resolveEntityScopeAlerts = ({
	fullCustomer,
	feature,
	entityId,
}: {
	fullCustomer: FullCustomer;
	feature: Feature;
	entityId: string;
}): ScopedUsageAlerts => {
	const entity = fullCustomer.entities?.find(
		(candidate) => candidate.id === entityId,
	);
	return {
		scope: "entity",
		entityId,
		alerts: filterUsageAlertsForFeature({
			alerts: entity?.usage_alerts ?? [],
			feature,
		}),
	};
};
