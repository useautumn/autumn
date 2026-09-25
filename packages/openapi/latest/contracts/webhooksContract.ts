import {
	CreateWebhookParamsSchema,
	CreateWebhookResponseSchema,
	DeleteWebhookParamsSchema,
	DeleteWebhookResponseSchema,
	GetWebhookParamsSchema,
	ListWebhooksParamsSchema,
	ListWebhooksResponseSchema,
	PreviewSyncWebhooksResponseSchema,
	SyncWebhooksParamsSchema,
	SyncWebhooksResponseSchema,
	UpdateWebhookParamsSchema,
	WebhookSchema,
} from "@api/webhooks/endpoints/webhookModels.js";
import { oc } from "@orpc/contract";
import {
	createWebhookJsDoc,
	deleteWebhookJsDoc,
	getWebhookJsDoc,
	listWebhooksJsDoc,
	previewSyncWebhooksJsDoc,
	syncWebhooksJsDoc,
	updateWebhookJsDoc,
} from "../jsDocs/webhooksJsDocs";

const webhookParamsExample = {
	id: "billing",
	url: "https://example.com/webhooks/autumn",
	events: ["billing.updated", "invoice.finalized"],
	description: "Plan changes and invoices",
};

const webhookExample = {
	...webhookParamsExample,
	disabled: false,
	created_at: 1781113864000,
	updated_at: 1781113864000,
};

const route = ({
	verb,
	operationId,
	nameOverride,
	description,
}: {
	verb: string;
	operationId: string;
	nameOverride: string;
	description: string;
}) =>
	oc.route({
		method: "POST",
		path: `/v1/webhooks.${verb}` as `/${string}`,
		operationId,
		tags: ["webhooks"],
		description,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": nameOverride,
		}),
	});

export const createWebhookContract = route({
	verb: "create",
	operationId: "createWebhook",
	nameOverride: "create",
	description: createWebhookJsDoc,
})
	.input(
		CreateWebhookParamsSchema.meta({
			title: "CreateWebhookParams",
			examples: [webhookParamsExample],
		}),
	)
	.output(
		CreateWebhookResponseSchema.meta({
			title: "CreateWebhookResponse",
			examples: [{ ...webhookExample, secret: "whsec_abc123" }],
		}),
	);

export const getWebhookContract = route({
	verb: "get",
	operationId: "getWebhook",
	nameOverride: "get",
	description: getWebhookJsDoc,
})
	.input(
		GetWebhookParamsSchema.meta({
			title: "GetWebhookParams",
			examples: [{ id: "billing" }],
		}),
	)
	.output(WebhookSchema.meta({ title: "Webhook", examples: [webhookExample] }));

export const listWebhooksContract = route({
	verb: "list",
	operationId: "listWebhooks",
	nameOverride: "list",
	description: listWebhooksJsDoc,
})
	.input(
		ListWebhooksParamsSchema.meta({
			title: "ListWebhooksParams",
			examples: [{}],
		}),
	)
	.output(
		ListWebhooksResponseSchema.meta({
			title: "ListWebhooksResponse",
			examples: [{ list: [webhookExample] }],
		}),
	);

export const updateWebhookContract = route({
	verb: "update",
	operationId: "updateWebhook",
	nameOverride: "update",
	description: updateWebhookJsDoc,
})
	.input(
		UpdateWebhookParamsSchema.meta({
			title: "UpdateWebhookParams",
			examples: [{ id: "billing", disabled: true }],
		}),
	)
	.output(
		WebhookSchema.meta({
			title: "Webhook",
			examples: [{ ...webhookExample, disabled: true }],
		}),
	);

export const deleteWebhookContract = route({
	verb: "delete",
	operationId: "deleteWebhook",
	nameOverride: "delete",
	description: deleteWebhookJsDoc,
})
	.input(
		DeleteWebhookParamsSchema.meta({
			title: "DeleteWebhookParams",
			examples: [{ id: "billing" }],
		}),
	)
	.output(
		DeleteWebhookResponseSchema.meta({
			title: "DeleteWebhookResponse",
			examples: [{ success: true }],
		}),
	);

export const previewSyncWebhooksContract = route({
	verb: "preview_sync",
	operationId: "previewSyncWebhooks",
	nameOverride: "previewSync",
	description: previewSyncWebhooksJsDoc,
})
	.input(
		SyncWebhooksParamsSchema.meta({
			title: "SyncWebhooksParams",
			examples: [{ webhooks: [webhookParamsExample] }],
		}),
	)
	.output(
		PreviewSyncWebhooksResponseSchema.meta({
			title: "PreviewSyncWebhooksResponse",
			examples: [
				{
					changes: [
						{ action: "create", id: "billing", webhook: webhookExample },
					],
				},
			],
		}),
	);

export const syncWebhooksContract = route({
	verb: "sync",
	operationId: "syncWebhooks",
	nameOverride: "sync",
	description: syncWebhooksJsDoc,
})
	.input(
		SyncWebhooksParamsSchema.meta({
			title: "SyncWebhooksParams",
			examples: [{ webhooks: [webhookParamsExample] }],
		}),
	)
	.output(
		SyncWebhooksResponseSchema.meta({
			title: "SyncWebhooksResponse",
			examples: [
				{
					webhooks: [webhookExample],
					secrets: [{ id: "billing", secret: "whsec_abc123" }],
					errors: [],
				},
			],
		}),
	);
