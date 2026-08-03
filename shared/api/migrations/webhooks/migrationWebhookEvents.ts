import { WebhookEventType } from "../../webhooks/webhookEventType.js";

/** Events a migration run can emit — nothing is queued unless the org listens. */
export const MIGRATION_WEBHOOK_EVENT_TYPES: string[] = [
	WebhookEventType.BillingUpdated,
	WebhookEventType.CustomerProductsUpdated,
];
