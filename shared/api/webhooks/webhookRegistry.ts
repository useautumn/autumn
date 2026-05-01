import type { z } from "zod/v4";
import { BalancesLimitReachedSchema } from "./balances/balancesLimitReached.js";
import { BalancesUsageAlertTriggeredSchema } from "./balances/balancesUsageAlertTriggered.js";
import { BillingAutoTopupSucceededSchema } from "./billing/billingAutoTopupSucceeded.js";
import { VercelResourceDeletedSchema } from "./vercel/vercelResourceDeleted.js";
import { VercelResourceProvisionedSchema } from "./vercel/vercelResourceProvisioned.js";
import { VercelResourceRotateSecretsSchema } from "./vercel/vercelResourceRotateSecrets.js";
import { VercelWebhookEventSchema } from "./vercel/vercelWebhookEvent.js";
import { WebhookEventType } from "./webhookEventType.js";

export interface WebhookDefinition {
	eventType: string;
	operationId: string;
	title: string;
	schema?: z.ZodType;
	description: string;
	group: string;
	deprecated?: boolean;
	archived?: boolean;
	featureFlags?: string[];
}

export const webhookRegistry: WebhookDefinition[] = [
	// ── Balances ──────────────────────────────────────────────────────────
	{
		eventType: WebhookEventType.BalancesUsageAlertTriggered,
		operationId: "balancesUsageAlertTriggered",
		title: "Usage Alert Triggered",
		schema: BalancesUsageAlertTriggeredSchema,
		group: "Balances",
		description:
			"Fired when a customer crosses a configured usage alert threshold.",
	},
	{
		eventType: WebhookEventType.BalancesLimitReached,
		operationId: "balancesLimitReached",
		title: "Limit Reached",
		schema: BalancesLimitReachedSchema,
		group: "Balances",
		description:
			"Fired when a customer reaches the limit for a feature (included allowance, max purchase, or spend limit).",
	},

	// ── Billing ───────────────────────────────────────────────────────────
	{
		eventType: WebhookEventType.BillingAutoTopupSucceeded,
		operationId: "billingAutoTopupSucceeded",
		title: "Auto Top-Up Succeeded",
		schema: BillingAutoTopupSucceededSchema,
		group: "Billing",
		description:
			"Fired when an automatic top-up grants additional prepaid balance.",
	},

	// ── Vercel ────────────────────────────────────────────────────────────
	{
		eventType: WebhookEventType.VercelResourcesDeleted,
		operationId: "vercelResourcesDeleted",
		title: "Resource Deleted",
		schema: VercelResourceDeletedSchema,
		group: "Vercel",
		description:
			"When a Vercel resource is deleted, you'll need to handle de-provisioning any API keys or other non-Autumn controlled data for this user.",
		featureFlags: ["vercel"],
	},
	{
		eventType: WebhookEventType.VercelResourcesProvisioned,
		operationId: "vercelResourcesProvisioned",
		title: "Resource Provisioned",
		schema: VercelResourceProvisionedSchema,
		group: "Vercel",
		description:
			"When a Vercel resource is created, you'll need to provision a secret key for your service. Then you can use the provided access token to patch the resource's secrets.",
		featureFlags: ["vercel"],
	},
	{
		eventType: WebhookEventType.VercelResourcesRotateSecrets,
		operationId: "vercelResourcesRotateSecrets",
		title: "Rotate Secrets",
		schema: VercelResourceRotateSecretsSchema,
		group: "Vercel",
		description:
			"This event is sent when Vercel requires a resource's secrets to be rotated.",
		featureFlags: ["vercel"],
	},
	{
		eventType: WebhookEventType.VercelWebhooksEvent,
		operationId: "vercelWebhooksEvent",
		title: "Webhook Event",
		schema: VercelWebhookEventSchema,
		group: "Vercel",
		description: "Passthrough webhook for Vercel events.",
		featureFlags: ["vercel"],
	},
];
