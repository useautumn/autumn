import { type Webhook, WebhookEventType } from "@autumn/shared";
import type { EndpointOut } from "svix";

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(WebhookEventType));

const isWebhookEventType = (event: string): event is WebhookEventType =>
	KNOWN_EVENT_TYPES.has(event);

/** Svix's endpoint as the public Webhook: our id is its `uid`, falling back to
 * the `ep_…` id for endpoints made in the dashboard. Never carries the secret. */
export const svixEndpointToWebhook = ({
	endpoint,
}: {
	endpoint: EndpointOut;
}): Webhook => ({
	id: endpoint.uid ?? endpoint.id,
	url: endpoint.url,
	description: endpoint.description || null,
	events: (endpoint.filterTypes ?? []).filter(isWebhookEventType),
	disabled: endpoint.disabled ?? false,
	created_at: new Date(endpoint.createdAt).getTime(),
	updated_at: new Date(endpoint.updatedAt).getTime(),
});
