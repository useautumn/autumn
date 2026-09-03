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
}): BalancesUsageAlertTriggered => {
	const subject = {
		customer_id: customerId,
		feature_id: feature.id,
		...(entityId && { entity_id: entityId }),
	};
	const alertFields = {
		name: alert.name,
		threshold: alert.threshold,
		threshold_type: alert.threshold_type,
	};
	const { payloadBlock } = measurement;

	if (payloadBlock.basis === "usage_limit") {
		return {
			...subject,
			usage_alert: {
				...alertFields,
				basis: payloadBlock.basis,
				...(alert.filter && { filter: alert.filter }),
			},
			usage_limit: payloadBlock.usage_limit,
		};
	}
	return {
		...subject,
		usage_alert: { ...alertFields, basis: payloadBlock.basis },
		balance: payloadBlock.balance,
	};
};
