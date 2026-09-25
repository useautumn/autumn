import type { Webhook } from "@autumn/shared";
import type { EndpointOut } from "svix";

/** Svix's endpoint as the public Webhook: our id is its `uid`, falling back to
 * the `ep_…` id for endpoints made in the dashboard. Event names are returned
 * verbatim, so a type newer than a client is never dropped. Never carries the secret. */
export const svixEndpointToWebhook = ({
	endpoint,
}: {
	endpoint: EndpointOut;
}): Webhook => ({
	id: endpoint.uid ?? endpoint.id,
	url: endpoint.url,
	description: endpoint.description || null,
	events: endpoint.filterTypes ?? [],
	disabled: endpoint.disabled ?? false,
	created_at: new Date(endpoint.createdAt).getTime(),
	updated_at: new Date(endpoint.updatedAt).getTime(),
});
