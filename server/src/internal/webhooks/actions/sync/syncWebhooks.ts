import type {
	SyncWebhooksResponse,
	Webhook,
	WebhookParams,
} from "@autumn/shared";
import { createWebhook } from "../createWebhook.js";
import { listWebhooks } from "../listWebhooks.js";
import { updateWebhook } from "../updateWebhook.js";
import { computeWebhookSyncChanges } from "./computeWebhookSyncChanges.js";

/** Applies preview_sync's creates and updates. Unmanaged webhooks are left
 * alone, and only newly created ones return a secret. */
export const syncWebhooks = async ({
	appId,
	stated,
}: {
	appId: string;
	stated: WebhookParams[];
}): Promise<SyncWebhooksResponse> => {
	const remote = await listWebhooks({ appId });
	const changes = computeWebhookSyncChanges({
		remote,
		stated,
		now: Date.now(),
	});
	const statedById = new Map(stated.map((params) => [params.id, params]));

	const secrets: SyncWebhooksResponse["secrets"] = [];
	const resultById = new Map<string, Webhook>(
		remote.map((webhook) => [webhook.id, webhook]),
	);

	await Promise.all(
		changes.map(async (change) => {
			const params = statedById.get(change.id);
			if (!params) return;
			if (change.action === "create") {
				const { webhook, secret } = await createWebhook({ appId, params });
				secrets.push({ id: webhook.id, secret });
				resultById.set(webhook.id, webhook);
				return;
			}
			resultById.set(change.id, await updateWebhook({ appId, params }));
		}),
	);

	return {
		webhooks: stated.flatMap((params) => resultById.get(params.id) ?? []),
		secrets,
	};
};
