import type {
	BalancesUsageAlertTriggered,
	DbUsageAlert,
	Feature,
} from "@autumn/shared";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";

export const buildUsageAlertPayload = ({
	customerId,
	entityId,
	feature,
	alert,
	measurement,
}: {
	customerId: string;
	entityId?: string;
	feature: Feature;
	alert: DbUsageAlert;
	measurement: UsageAlertMeasurement;
}): BalancesUsageAlertTriggered => ({
	customer_id: customerId,
	feature_id: feature.id,
	...(entityId && { entity_id: entityId }),
	usage_alert: {
		name: alert.name,
		threshold: alert.threshold,
		threshold_type: alert.threshold_type,
		basis: alert.basis ?? "balance",
		...(alert.filter && { filter: alert.filter }),
	},
	...measurement.payloadBlock,
});
