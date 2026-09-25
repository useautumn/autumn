import type { AutumnClient } from "../../generated/client";
import { webhooksHaveWork } from "../../render/renderWebhooks";
import type { WebhooksLane } from "./previewWebhooks";
import { writeWebhookSecrets } from "./writeWebhookSecrets";

/**
 * Sync, then save every secret it returned — before reporting any per-item
 * failure, since a created webhook's secret is shown once and only here.
 */
export const applyWebhooks = async ({
	client,
	lane,
	envDirs,
	cwd,
	write,
}: {
	client: AutumnClient;
	lane: WebhooksLane | undefined;
	envDirs: string[];
	cwd: string;
	write: (text: string) => void;
}): Promise<void> => {
	if (lane === undefined || !webhooksHaveWork({ webhooks: lane.preview }))
		return;
	const result = await client.syncWebhooks(lane.body);
	const saved = await writeWebhookSecrets({
		secrets: result.secrets,
		env: lane.env,
		envDirs,
		cwd,
	});
	write(`\nApplied webhooks.\n${saved.map((line) => `${line}\n`).join("")}`);
	if (result.errors.length > 0)
		throw new Error(
			result.errors.map(({ id, message }) => `${id}: ${message}`).join("\n"),
		);
};
