import type { AutumnClient, SyncWebhooksParams } from "../../generated/client";
import type { WebhooksPreview } from "../../render/renderWebhooks";
import { resolveWebhooksForEnv } from "./resolveWebhooksForEnv";
import type { WebhookEnv } from "./types/webhookEnv";

export type WebhooksLane = {
	preview: WebhooksPreview;
	/** Exactly what the preview was asked about, so the sync applies the same set. */
	body: SyncWebhooksParams;
	env: WebhookEnv;
};

/** Absent when the config states no `webhooks`: an omitted list manages nothing. */
export const previewWebhooks = async ({
	client,
	rows,
	webhookEnv,
}: {
	client: AutumnClient;
	rows: Record<string, unknown>[] | undefined;
	webhookEnv: (() => Promise<WebhookEnv>) | undefined;
}): Promise<WebhooksLane | undefined> => {
	if (rows === undefined) return undefined;
	if (webhookEnv === undefined)
		throw new Error("webhooks need the target environment to pick each url.");
	const env = await webhookEnv();
	const webhooks = resolveWebhooksForEnv({
		rows,
		envKey: env.key,
	});
	const body = { webhooks };
	const { changes } = await client.previewSyncWebhooks(body);
	return { preview: { changes }, body, env };
};
