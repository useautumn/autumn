import type { Webhook, WebhookAppKind } from "@autumn/shared";
import { listAllSvixEndpoints } from "@/external/svix/endpoints/listAllSvixEndpoints.js";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import type { WebhookApp } from "../apps/webhookApps.js";

export type SyncRemote = {
	remote: Webhook[];
	/** Made in the dashboard: no uid, so adoptable by URL. */
	uidlessIds: Set<string>;
	/** Which app each remote webhook lives in. */
	remoteKinds: Map<string, WebhookAppKind>;
	appIdOf: Map<string, string>;
};

/** The env's webhooks across its apps, with where each one lives. */
export const listSyncRemote = async ({
	apps,
}: {
	apps: WebhookApp[];
}): Promise<SyncRemote> => {
	const result: SyncRemote = {
		remote: [],
		uidlessIds: new Set(),
		remoteKinds: new Map(),
		appIdOf: new Map(),
	};
	const listed = await Promise.all(
		apps.map(async (app) => ({
			app,
			endpoints: await listAllSvixEndpoints({ appId: app.appId }),
		})),
	);
	for (const { app, endpoints } of listed) {
		for (const endpoint of endpoints) {
			const webhook = svixEndpointToWebhook({ endpoint });
			result.remote.push(webhook);
			if (!endpoint.uid) result.uidlessIds.add(webhook.id);
			result.remoteKinds.set(webhook.id, app.kind);
			result.appIdOf.set(webhook.id, app.appId);
		}
	}
	return result;
};
