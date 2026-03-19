import {
	cusEntsToGrantedBalance,
	cusEntsToUsage,
	type DbUsageAlert,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	WebhookEventType,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const wasThresholdCrossed = ({
	alert,
	oldUsage,
	newUsage,
	grantedBalance,
}: {
	alert: DbUsageAlert;
	oldUsage: number;
	newUsage: number;
	grantedBalance: number;
}) => {
	if (alert.threshold_type === "usage_threshold") {
		return oldUsage < alert.threshold && newUsage >= alert.threshold;
	}

	// usage_percentage_threshold
	if (grantedBalance <= 0) return false;

	const oldPercentage = new Decimal(oldUsage)
		.div(grantedBalance)
		.mul(100)
		.toNumber();
	const newPercentage = new Decimal(newUsage)
		.div(grantedBalance)
		.mul(100)
		.toNumber();

	return oldPercentage < alert.threshold && newPercentage >= alert.threshold;
};

export const checkUsageAlerts = async ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
}) => {
	const usageAlerts = newFullCus.usage_alerts;
	if (!usageAlerts || usageAlerts.length === 0) return;

	const matchingAlerts = usageAlerts.filter(
		(alert) =>
			alert.enabled && (alert.feature_id === feature.id || !alert.feature_id),
	);

	if (matchingAlerts.length === 0) return;

	const oldCustomerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer: oldFullCus,
		featureId: feature.id,
	});

	const newCustomerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer: newFullCus,
		featureId: feature.id,
	});

	const oldUsage = cusEntsToUsage({ cusEnts: oldCustomerEntitlements });
	const newUsage = cusEntsToUsage({ cusEnts: newCustomerEntitlements });

	const grantedBalance = cusEntsToGrantedBalance({
		cusEnts: newCustomerEntitlements,
	});

	for (const alert of matchingAlerts) {
		if (!wasThresholdCrossed({ alert, oldUsage, newUsage, grantedBalance }))
			continue;

		const customerId = newFullCus.id || newFullCus.internal_id;

		await sendSvixEvent({
			org: ctx.org,
			env: ctx.env,
			eventType: WebhookEventType.BalancesThresholdReached,
			data: {
				customer_id: customerId,
				feature_id: feature.id,
				threshold_type: "usage_alert",
				usage_alert: {
					name: alert.name,
					threshold: alert.threshold,
					threshold_type: alert.threshold_type,
					current_usage: newUsage,
				},
			},
		});

		ctx.logger.info(
			`Usage alert triggered for customer ${customerId}, feature ${feature.id}, threshold ${alert.threshold} (${alert.threshold_type})`,
		);
	}
};
