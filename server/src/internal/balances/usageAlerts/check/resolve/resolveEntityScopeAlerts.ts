import type { Feature, FullCustomer } from "@autumn/shared";
import type { ScopedUsageAlerts } from "../types/scopedUsageAlerts.js";
import { filterUsageAlertsForFeature } from "./filterUsageAlertsForFeature.js";

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
