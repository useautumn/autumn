import {
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
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
	oldGrantedBalance,
	newGrantedBalance,
}: {
	alert: DbUsageAlert;
	oldUsage: number;
	newUsage: number;
	oldGrantedBalance: number;
	newGrantedBalance: number;
}) => {
	if (alert.threshold_type === "usage") {
		const shldAlert = oldUsage < alert.threshold && newUsage >= alert.threshold;

		return shldAlert;
	}

	// usage_percentage
	if (oldGrantedBalance <= 0 || newGrantedBalance <= 0) return false;

	const oldPercentage = new Decimal(oldUsage)
		.div(oldGrantedBalance)
		.mul(100)
		.toNumber();
	const newPercentage = new Decimal(newUsage)
		.div(newGrantedBalance)
		.mul(100)
		.toNumber();

	return oldPercentage < alert.threshold && newPercentage >= alert.threshold;
};

const processAlerts = async ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}) => {
	const entity = entityId
		? newFullCus.entities?.find((e) => e.id === entityId)
		: undefined;

	const alerts = entity ? entity.usage_alerts : newFullCus.usage_alerts;
	if (!alerts || alerts.length === 0) return;

	const matchingAlerts = alerts.filter(
		(alert) =>
			alert.enabled && (alert.feature_id === feature.id || !alert.feature_id),
	);

	if (matchingAlerts.length === 0) return;

	const oldCustomerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer: oldFullCus,
		featureId: feature.id,
		entity,
	});

	const newCustomerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer: newFullCus,
		featureId: feature.id,
		entity,
	});

	const oldUsage = cusEntsToUsage({ cusEnts: oldCustomerEntitlements });
	const newUsage = cusEntsToUsage({ cusEnts: newCustomerEntitlements });

	const oldGrantedBalance = new Decimal(
		cusEntsToGrantedBalance({ cusEnts: oldCustomerEntitlements }),
	)
		.add(cusEntsToPrepaidQuantity({ cusEnts: oldCustomerEntitlements }))
		.toNumber();

	const newGrantedBalance = new Decimal(
		cusEntsToGrantedBalance({ cusEnts: newCustomerEntitlements }),
	)
		.add(cusEntsToPrepaidQuantity({ cusEnts: newCustomerEntitlements }))
		.toNumber();

	for (const alert of matchingAlerts) {
		if (
			!wasThresholdCrossed({
				alert,
				oldUsage,
				newUsage,
				oldGrantedBalance,
				newGrantedBalance,
			})
		)
			continue;

		const customerId = newFullCus.id || newFullCus.internal_id;

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BalancesUsageAlertTriggered,
			data: {
				customer_id: customerId,
				feature_id: feature.id,
				...(entityId && { entity_id: entityId }),
				usage_alert: {
					name: alert.name,
					threshold: alert.threshold,
					threshold_type: alert.threshold_type,
				},
			},
		});

		ctx.logger.info(
			`Usage alert triggered for customer ${customerId}, feature ${feature.id}, threshold ${alert.threshold} (${alert.threshold_type})${entityId ? `, entity ${entityId}` : ""}`,
		);
	}
};

export const checkUsageAlerts = async ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}) => {
	// 1. Customer-level alerts (always checked, no entity scoping)
	await processAlerts({ ctx, oldFullCus, newFullCus, feature });

	// 2. Entity-level alerts (only when entityId is provided)
	if (!entityId) return;
	await processAlerts({ ctx, oldFullCus, newFullCus, feature, entityId });
};
