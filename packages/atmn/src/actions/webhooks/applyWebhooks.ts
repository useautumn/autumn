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
	// A secret means the server created the webhook after all (its dashboard
	// twin moved since the preview): only the rest were adopted.
	const failed = new Set([
		...result.errors.map(({ id }) => id),
		...result.secrets.map(({ id }) => id),
	]);
	// An adopted webhook keeps its signing secret, so nothing is written for it.
	const adopted = lane.preview.changes
		.filter((change) => change.action === "adopt" && !failed.has(change.id))
		.map(
			(change) =>
				`Adopted ${change.id} (existing dashboard webhook); its signing secret is unchanged, nothing written`,
		);
	write(
		`\nApplied webhooks.\n${[...adopted, ...saved].map((line) => `${line}\n`).join("")}`,
	);
	if (result.errors.length > 0)
		throw new Error(
			result.errors.map(({ id, message }) => `${id}: ${message}`).join("\n"),
		);
};
