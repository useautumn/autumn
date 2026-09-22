import type { CheckCommand } from "@autumn/balance-engine";
import {
	type BalancesUsageAlertTriggered,
	customerToSvixTags,
	type DbUsageAlert,
	DEFAULT_USAGE_ALERT_BASIS,
	type Feature,
	ms,
	usageLimitFilterKey,
	WebhookEventType,
} from "@autumn/shared";
import type { BalanceWebhook } from "../types/balanceWebhook.js";
import type { AlertScope, UsageAlertMeasurement } from "./types/usageAlert.js";

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

// The period keeps windowed alerts re-firing each window; the minute bucket collapses a burst into one send.
export const buildUsageAlertIdempotencyKey = ({
	orgId,
	env,
	now,
	customerId,
	entityId,
	scope,
	feature,
	alert,
	periodStartAt,
}: {
	orgId: string;
	env: string;
	now: number;
	customerId: string;
	entityId?: string;
	scope: AlertScope;
	feature: Feature;
	alert: DbUsageAlert;
	periodStartAt: number | null;
}): string =>
	[
		orgId,
		env,
		customerId,
		entityId ?? "_",
		scope,
		feature.id,
		alert.basis ?? DEFAULT_USAGE_ALERT_BASIS,
		usageLimitFilterKey(alert.filter) || "_",
		alert.threshold_type,
		alert.threshold,
		periodStartAt ?? "_",
		Math.floor(now / ms.minutes(1)),
	].join(":");

/** The webhook a fired alert becomes. The payload names the scope's entity; the tags name the tracked one, as prod does. */
export const usageAlertToWebhook = ({
	command,
	feature,
	alert,
	scope,
	entityId,
	measurement,
}: {
	command: CheckCommand;
	feature: Feature;
	alert: DbUsageAlert;
	scope: AlertScope;
	entityId?: string;
	measurement: UsageAlertMeasurement;
}): BalanceWebhook => {
	const { customerId, orgId, env } = command.identity;
	return {
		eventType: WebhookEventType.BalancesUsageAlertTriggered,
		data: buildUsageAlertPayload({
			customerId,
			entityId,
			feature,
			alert,
			measurement,
		}),
		tags: customerToSvixTags({
			customerId,
			entityId: command.identity.entityId,
		}),
		idempotencyKey: buildUsageAlertIdempotencyKey({
			orgId: command.org.id ?? orgId,
			env,
			now: command.occurredAt,
			customerId,
			entityId,
			scope,
			feature,
			alert,
			periodStartAt: measurement.periodStartAt,
		}),
	};
};
