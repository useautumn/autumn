/**
 * An event type this server version doesn't know is still what Svix stores:
 * responses carry every name verbatim, so an older CLI never drops one.
 */

import { expect, test } from "bun:test";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";

test("unknown event types are returned verbatim, never dropped", () => {
	const webhook = svixEndpointToWebhook({
		endpoint: {
			id: "ep_1",
			uid: "billing",
			url: "https://example.com/hook",
			description: "",
			filterTypes: ["billing.updated", "billing.renamed_in_the_future"],
			disabled: false,
			createdAt: new Date(1),
			updatedAt: new Date(1),
			version: 1,
			metadata: {},
		},
	});
	expect(webhook.events).toEqual([
		"billing.updated",
		"billing.renamed_in_the_future",
	]);
});
