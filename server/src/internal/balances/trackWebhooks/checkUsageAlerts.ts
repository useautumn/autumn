import {
	type ApiBalanceV1,
	AppEnv,
	type DbUsageAlert,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToTags,
	getApiBalance,
	WebhookEventType,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

type AlertScope = "customer" | "entity" | "org";

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
			currentRemainingPercentage <= alert.threshold &&
			oldRemainingPercentage > alert.threshold
		);
	}

	if (alert.threshold_type === "remaining") {
		const currentRemaining = newApiBalance.remaining;
		const oldRemaining = oldApiBalance.remaining;

		return (
			currentRemaining <= alert.threshold && oldRemaining > alert.threshold
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
	alerts,
	scope,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
	alerts: DbUsageAlert[];
	scope: AlertScope;
}) => {
	if (!alerts || alerts.length === 0) return;

	const matchingAlerts = alerts.filter(
		(alert) =>
			alert.enabled && (alert.feature_id === feature.id || !alert.feature_id),
	);

	if (matchingAlerts.length === 0) return;

	const entity = entityId
		? newFullCus.entities?.find((e) => e.id === entityId)
		: undefined;

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

		const minuteBucket = Math.floor(Date.now() / 60_000);
		const idempotencyKey = [
			ctx.org.id,
			ctx.env,
			customerId,
			entityId ?? "_",
			scope,
			feature.id,
			alert.threshold_type,
			alert.threshold,
			minuteBucket,
		].join(":");

		const tags = fullCustomerToTags({ fullCustomer: newFullCus });

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BalancesUsageAlertTriggered,
			idempotencyKey,
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
			tags,
		});

		ctx.logger.info(
			`Usage alert triggered (scope=${scope}) for customer ${customerId}, feature ${feature.id}, threshold ${alert.threshold} (${alert.threshold_type})${entityId ? `, entity ${entityId}` : ""}`,
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
	await processAlerts({
		ctx,
		oldFullCus,
		newFullCus,
		feature,
		alerts: newFullCus.usage_alerts ?? [],
		scope: "customer",
	});

	// 2. Org-level alerts (apply to all customers; evaluated against customer-level balance).
	// Env-scoped: sandbox reads sandbox_usage_alerts, live reads usage_alerts.
	const orgAlerts =
		ctx.env === AppEnv.Sandbox
			? (ctx.org.config?.sandbox_usage_alerts ?? [])
			: (ctx.org.config?.usage_alerts ?? []);
	if (orgAlerts.length > 0) {
		await processAlerts({
			ctx,
			oldFullCus,
			newFullCus,
			feature,
			alerts: orgAlerts,
			scope: "org",
		});
	}

	// 3. Entity-level alerts (only when entityId is provided)
	if (!entityId) return;
	const entity = newFullCus.entities?.find((e) => e.id === entityId);
	await processAlerts({
		ctx,
		oldFullCus,
		newFullCus,
		feature,
		entityId,
		alerts: entity?.usage_alerts ?? [],
		scope: "entity",
	});
};
