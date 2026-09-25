import { z } from "zod/v4";
import { WebhookEventType } from "../webhookEventType.js";
import { isLocalWebhookUrl } from "./isLocalWebhookUrl.js";

/**
 * Webhook endpoint request/response models. Shared between the server handlers
 * (request validation), the OpenAPI contract (SDK + docs) and atmn's lint.
 */

export const WEBHOOK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const WebhookIdSchema = z
	.string()
	.min(1)
	.max(256)
	.regex(
		WEBHOOK_ID_PATTERN,
		"Webhook id may only contain letters, digits, `-` and `_`",
	)
	.describe(
		"Your ID for the webhook: letters, digits, `-` and `_`. It can't be changed after creation.",
	);

/** Endpoints made in the dashboard have no id of ours, so they answer to Svix's. */
export const WebhookRefSchema = z
	.string()
	.min(1)
	.max(256)
	.regex(
		WEBHOOK_ID_PATTERN,
		"Pass a webhook id, or the `ep_…` id `webhooks.list` shows for a webhook made in the dashboard",
	)
	.describe(
		"The webhook's ID. Webhooks made in the dashboard use the `ep_…` ID shown by `webhooks.list`.",
	);

export const WebhookUrlSchema = z
	.url({ protocol: /^https?$/ })
	.refine((url) => !isLocalWebhookUrl(url), {
		message:
			"Webhook URL can't point at localhost or a private network. Use a public URL or a tunnel (e.g. ngrok).",
	})
	.describe(
		"The URL Autumn sends events to. Localhost and private-network addresses are rejected; tunnels such as ngrok work.",
	);

export const WebhookEventTypeSchema = z
	.enum(WebhookEventType)
	.describe("An event type the webhook receives.");

export const WebhookEventsSchema = z
	.array(WebhookEventTypeSchema)
	.min(1, "List at least one event; an empty list isn't allowed.")
	.describe("The events sent to this webhook. At least one.");

const descriptionField = z.string().describe("A note for your own reference.");

const disabledField = z
	.boolean()
	.describe("When true, no events are sent to the webhook.");

export const WebhookSchema = z.object({
	id: z
		.string()
		.describe(
			"The webhook's ID. Webhooks made in the dashboard show their `ep_…` ID.",
		),
	url: z.string().describe("The URL Autumn sends events to."),
	description: z.string().nullable().describe("A note for your own reference."),
	events: z
		.array(WebhookEventTypeSchema)
		.describe(
			"The events sent to this webhook. Empty only for a webhook made in the dashboard that receives every event.",
		),
	disabled: z
		.boolean()
		.describe("When true, no events are sent to the webhook."),
	created_at: z
		.number()
		.describe("When the webhook was created, ms since epoch."),
	updated_at: z
		.number()
		.describe("When the webhook was last changed, ms since epoch."),
});

const secretField = z
	.string()
	.describe(
		"The webhook's signing secret. Shown once, here: store it before you discard the response.",
	)
	.readonly();

export const WebhookParamsSchema = z.object({
	id: WebhookIdSchema,
	url: WebhookUrlSchema,
	events: WebhookEventsSchema,
	description: descriptionField.optional(),
	disabled: disabledField.optional(),
});

export const CreateWebhookParamsSchema = WebhookParamsSchema;

export const CreateWebhookResponseSchema = WebhookSchema.extend({
	secret: secretField,
});

export const GetWebhookParamsSchema = z.object({ id: WebhookRefSchema });

export const ListWebhooksParamsSchema = z
	.object({})
	.describe(
		"No body. Lists every webhook in the environment of the calling key.",
	);

export const ListWebhooksResponseSchema = z.object({
	list: z.array(WebhookSchema).describe("The environment's webhooks."),
});

export const UpdateWebhookParamsSchema = z.object({
	id: WebhookRefSchema,
	url: WebhookUrlSchema.optional(),
	events: WebhookEventsSchema.optional(),
	description: descriptionField.optional(),
	disabled: disabledField.optional(),
});

export const DeleteWebhookParamsSchema = z.object({ id: WebhookRefSchema });

export const DeleteWebhookResponseSchema = z.object({
	success: z
		.literal(true)
		.describe("Always true when the webhook was deleted."),
});

export const SyncWebhooksParamsSchema = z.object({
	webhooks: z
		.array(WebhookParamsSchema)
		.refine(
			(webhooks) =>
				new Set(webhooks.map((webhook) => webhook.id)).size === webhooks.length,
			{ message: "Each webhook id may appear only once." },
		)
		.describe(
			"The webhooks to create or update. Webhooks not listed are left alone; nothing is deleted.",
		),
});

export const WebhookSyncChangeSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("create"),
		id: z.string(),
		webhook: WebhookSchema,
	}),
	z.object({
		action: z.literal("update"),
		id: z.string(),
		before: WebhookSchema,
		after: WebhookSchema,
	}),
	z.object({
		action: z.literal("unmanaged"),
		id: z.string(),
		webhook: WebhookSchema,
	}),
]);

export const PreviewSyncWebhooksResponseSchema = z.object({
	changes: z
		.array(WebhookSyncChangeSchema)
		.describe(
			"What `webhooks.sync` would do. `unmanaged` webhooks exist but aren't listed, so sync leaves them alone.",
		),
});

export const SyncWebhooksResponseSchema = z.object({
	webhooks: z
		.array(WebhookSchema)
		.describe(
			"The listed webhooks as they stand after the sync, except those in `errors`.",
		),
	secrets: z
		.array(z.object({ id: z.string(), secret: secretField }))
		.describe(
			"Signing secrets for the webhooks this sync created, shown once. Existing webhooks keep theirs.",
		),
	errors: z
		.array(z.object({ id: z.string(), message: z.string() }))
		.describe(
			"Webhooks that couldn't be created or updated. The others were still applied; the request fails only when none could be.",
		),
});

export type Webhook = z.infer<typeof WebhookSchema>;
export type WebhookParams = z.infer<typeof WebhookParamsSchema>;
export type CreateWebhookParams = z.infer<typeof CreateWebhookParamsSchema>;
export type CreateWebhookResponse = z.infer<typeof CreateWebhookResponseSchema>;
export type GetWebhookParams = z.infer<typeof GetWebhookParamsSchema>;
export type ListWebhooksResponse = z.infer<typeof ListWebhooksResponseSchema>;
export type UpdateWebhookParams = z.infer<typeof UpdateWebhookParamsSchema>;
export type DeleteWebhookParams = z.infer<typeof DeleteWebhookParamsSchema>;
export type SyncWebhooksParams = z.infer<typeof SyncWebhooksParamsSchema>;
export type WebhookSyncChange = z.infer<typeof WebhookSyncChangeSchema>;
export type PreviewSyncWebhooksResponse = z.infer<
	typeof PreviewSyncWebhooksResponseSchema
>;
export type SyncWebhooksResponse = z.infer<typeof SyncWebhooksResponseSchema>;
