import type { Webhook } from "@autumn/shared";
import type { EndpointOut } from "svix";

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
