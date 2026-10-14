import { WebhookEventType } from "../../webhooks/webhookEventType.js";

export const MIGRATION_WEBHOOK_EVENT_TYPES: string[] = [
	WebhookEventType.BillingUpdated,
	WebhookEventType.CustomerProductsUpdated,
];
