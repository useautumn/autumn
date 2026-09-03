import {
	type DbUsageAlert,
	DEFAULT_USAGE_ALERT_BASIS,
	type Feature,
	type FullCustomer,
	fullCustomerToTags,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AlertScope } from "../types/alertScope.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";
import { buildUsageAlertIdempotencyKey } from "./buildUsageAlertIdempotencyKey.js";
import { buildUsageAlertPayload } from "./buildUsageAlertPayload.js";

export const sendUsageAlertWebhook = async ({
	ctx,
	fullCustomer,
	feature,
	alert,
	scope,
	entityId,
	measurement,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	feature: Feature;
	alert: DbUsageAlert;
	scope: AlertScope;
	entityId?: string;
	measurement: UsageAlertMeasurement;
}): Promise<void> => {
	const customerId = fullCustomer.id || fullCustomer.internal_id;

	await sendSvixEvent({
		ctx,
		eventType: WebhookEventType.BalancesUsageAlertTriggered,
		idempotencyKey: buildUsageAlertIdempotencyKey({
			ctx,
			customerId,
			entityId,
			scope,
			feature,
			alert,
			periodStartAt: measurement.periodStartAt,
		}),
		data: buildUsageAlertPayload({
			customerId,
			entityId,
			feature,
			alert,
			measurement,
		}),
		tags: fullCustomerToTags({ fullCustomer }),
	});

	ctx.logger.info(
		`Usage alert triggered (scope=${scope}, basis=${alert.basis ?? DEFAULT_USAGE_ALERT_BASIS}) for customer ${customerId}, feature ${feature.id}, threshold ${alert.threshold} (${alert.threshold_type})${entityId ? `, entity ${entityId}` : ""}`,
	);
};
