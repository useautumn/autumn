import { webhooksHaveWork } from "../../render/renderWebhooks";
import type { WebhooksLane } from "./previewWebhookEnvs";
import {
	messageOf,
	throwWebhookEnvFailures,
	type WebhookEnvFailure,
} from "./webhookEnvFailures";
import { webhookSecretName } from "./webhookSecretName";
import { writeWebhookSecrets } from "./writeWebhookSecrets";

type SyncResult = Awaited<ReturnType<WebhooksLane["client"]["syncWebhooks"]>>;

/**
 * Save every secret the sync returned — before reporting any per-item failure,
 * since a created webhook's secret is shown once and only here.
 */
const saveLane = async ({
	lane,
	result,
	claimed,
	envDirs,
	cwd,
	write,
}: {
	lane: WebhooksLane;
	result: SyncResult;
	/** Secret names already saved this push, with the env that saved each. */
	claimed: Map<string, string>;
	envDirs: string[];
	cwd: string;
	write: (text: string) => void;
}): Promise<void> => {
	// A previewed update can still become a create, so two slugs sharing a name can both return one.
	const clashes: string[] = [];
	const secrets = result.secrets.filter(({ id }) => {
		const name = webhookSecretName({
			id,
			...(lane.env.live ? {} : { envKey: lane.env.key }),
		});
		const owner = claimed.get(name);
		if (owner === undefined) {
			claimed.set(name, lane.env.key);
			return true;
		}
		clashes.push(
			`${owner} and ${lane.env.key} both created ${id}, but only one signing secret fits ${name}: kept ${owner}'s. Rename one of those sandboxes, then rotate ${lane.env.key}'s ${id} secret in the dashboard.`,
		);
		return false;
	});
	let saved: string[];
	try {
		saved = await writeWebhookSecrets({
			secrets,
			env: lane.env,
			envDirs,
			cwd,
		});
	} catch (error) {
		// Nothing was saved, so another env may still save under these names.
		for (const [name, owner] of claimed)
			if (owner === lane.env.key) claimed.delete(name);
		throw error;
	}
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
	const errors = [
		...result.errors.map(({ id, message }) => `${id}: ${message}`),
		...clashes,
	];
	if (errors.length > 0) throw new Error(errors.join("\n"));
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
	// Shared across lanes: each saves as soon as its own sync answers.
	const claimed = new Map<string, string>();
	const results = await Promise.allSettled(
		withWork.map(async (lane) =>
			saveLane({
				lane,
				result: await lane.client.syncWebhooks(lane.body),
				claimed,
				envDirs,
				cwd,
				write,
			}),
		),
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
