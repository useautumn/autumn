import {
	type ApiBalanceV1,
	type DbUsageAlert,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	getApiBalance,
	WebhookEventType,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const wasThresholdCrossed = ({
	alert,
	oldApiBalance,
	newApiBalance,
}: {
	alert: DbUsageAlert;
	oldApiBalance: ApiBalanceV1;
	newApiBalance: ApiBalanceV1;
}) => {
	if (alert.threshold_type === "usage") {
		const shldAlert =
			oldApiBalance.usage < alert.threshold &&
			newApiBalance.usage >= alert.threshold;

		return shldAlert;
	}

	if (alert.threshold_type === "remaining_percentage") {
		if (oldApiBalance.granted <= 0 || newApiBalance.granted <= 0) return false;

		const currentRemainingPercentage = new Decimal(newApiBalance.remaining)
			.div(newApiBalance.granted)
			.mul(100)
			.toNumber();

		const oldRemainingPercentage = new Decimal(oldApiBalance.remaining)
			.div(oldApiBalance.granted)
			.mul(100)
			.toNumber();

		return (
			currentRemainingPercentage < alert.threshold &&
			oldRemainingPercentage >= alert.threshold
		);
	}

	if (alert.threshold_type === "remaining") {
		const currentRemaining = newApiBalance.remaining;
		const oldRemaining = oldApiBalance.remaining;

		return (
			currentRemaining < alert.threshold && oldRemaining >= alert.threshold
		);
	}

	// usage_percentage
	if (alert.threshold_type === "usage_percentage") {
		if (oldApiBalance.granted <= 0 || newApiBalance.granted <= 0) return false;

		const oldPercentage = new Decimal(oldApiBalance.usage)
			.div(oldApiBalance.granted)
			.mul(100)
			.toNumber();
		const newPercentage = new Decimal(newApiBalance.usage)
			.div(newApiBalance.granted)
			.mul(100)
			.toNumber();

		return oldPercentage < alert.threshold && newPercentage >= alert.threshold;
	}

	return false;
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

	const { data: oldApiBalance } = getApiBalance({
		ctx,
		fullCus: oldFullCus,
		cusEnts: oldCustomerEntitlements,
		feature,
	});
	const { data: newApiBalance } = getApiBalance({
		ctx,
		fullCus: newFullCus,
		cusEnts: newCustomerEntitlements,
		feature,
	});

	for (const alert of matchingAlerts) {
		if (
			!wasThresholdCrossed({
				alert,
				oldApiBalance,
				newApiBalance,
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
