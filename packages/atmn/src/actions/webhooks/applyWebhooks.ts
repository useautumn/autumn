import { webhooksHaveWork } from "../../render/renderWebhooks";
import type { WebhooksLane } from "./previewWebhookEnvs";
import {
	messageOf,
	throwWebhookEnvFailures,
	type WebhookEnvFailure,
} from "./webhookEnvFailures";
import { writeWebhookSecrets } from "./writeWebhookSecrets";

/**
 * Sync, then save every secret it returned — before reporting any per-item
 * failure, since a created webhook's secret is shown once and only here.
 */
const applyLane = async ({
	lane,
	envDirs,
	cwd,
	write,
}: {
	lane: WebhooksLane;
	envDirs: string[];
	cwd: string;
	write: (text: string) => void;
}): Promise<void> => {
	const result = await lane.client.syncWebhooks(lane.body);
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
		`\nApplied webhooks to ${lane.env.key}.\n${[...adopted, ...saved].map((line) => `${line}\n`).join("")}`,
	);
	if (result.errors.length > 0)
		throw new Error(
			result.errors.map(({ id, message }) => `${id}: ${message}`).join("\n"),
		);
};

/** Every env with work syncs in parallel; one env failing never stops another saving its secrets. */
export const applyWebhooks = async ({
	lanes,
	envDirs,
	cwd,
	write,
}: {
	lanes: WebhooksLane[];
	envDirs: string[];
	cwd: string;
	write: (text: string) => void;
}): Promise<void> => {
	const withWork = lanes.filter((lane) =>
		webhooksHaveWork({ webhooks: lane.preview }),
	);
	const results = await Promise.allSettled(
		withWork.map((lane) => applyLane({ lane, envDirs, cwd, write })),
	);
	const failures: WebhookEnvFailure[] = results.flatMap((result, index) =>
		result.status === "rejected"
			? [
					{
						env: withWork[index]?.env.key ?? "",
						message: messageOf(result.reason),
					},
				]
			: [],
	);
	throwWebhookEnvFailures({ failures, envCount: withWork.length });
};
