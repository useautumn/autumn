import { webhooksHaveWork } from "../../render/renderWebhooks";
import type { WebhooksLane } from "./previewWebhookEnvs";
import {
	messageOf,
	throwWebhookEnvFailures,
	type WebhookEnvFailure,
} from "./webhookEnvFailures";
import { envWebhookSecretName } from "./webhookSecretName";
import { writeWebhookSecrets } from "./writeWebhookSecrets";

type SyncResult = Awaited<ReturnType<WebhooksLane["client"]["syncWebhooks"]>>;

/**
 * Save every secret the sync returned — before reporting any per-item failure,
 * since a created webhook's secret is shown once and only here.
 */
const saveLane = async ({
	lane,
	lanes,
	result,
	claimed,
	savedEnv,
	envDirs,
	cwd,
	write,
}: {
	lane: WebhooksLane;
	/** Every env in the push, including those with nothing to change. */
	lanes: WebhooksLane[];
	result: SyncResult;
	/** Secret names already saved this push, with the env that saved each. */
	claimed: Map<string, string>;
	/** The loaded env files, before this push saved anything. */
	savedEnv: Record<string, string | undefined>;
	envDirs: string[];
	cwd: string;
	write: (text: string) => void;
}): Promise<void> => {
	// A previewed update can still become a create, so two slugs sharing a name can both return one.
	const clashes: string[] = [];
	const secrets = result.secrets.filter(({ id }) => {
		const name = envWebhookSecretName({ env: lane.env, id });
		const owner = claimed.get(name);
		if (owner !== undefined) {
			clashes.push(
				`${owner} and ${lane.env.key} both created ${id}, but only one signing secret fits ${name}: kept ${owner}'s. Rename one of those sandboxes, then rotate ${lane.env.key}'s ${id} secret in the dashboard.`,
			);
			return false;
		}
		const sharer = lanes.find(
			(other) =>
				other !== lane &&
				other.body.webhooks.some(
					(webhook) =>
						envWebhookSecretName({ env: other.env, id: webhook.id }) === name,
				),
		);
		if (sharer !== undefined && savedEnv[name] !== undefined) {
			clashes.push(
				`${sharer.env.key} states ${id} too, and a secret is already saved as ${name}: kept it. Rename one of those sandboxes, then rotate ${lane.env.key}'s ${id} secret in the dashboard.`,
			);
			return false;
		}
		claimed.set(name, lane.env.key);
		return true;
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
	const claimed = new Map<string, string>();
	// Each env saves as soon as its sync answers, one save at a time, so every
	// save sees the outcome of the one before it.
	let saving: Promise<void> = Promise.resolve();
	const results = await Promise.allSettled(
		withWork.map(async (lane) => {
			const result = await lane.client.syncWebhooks(lane.body);
			const save = saving.then(() =>
				saveLane({
					lane,
					lanes,
					result,
					claimed,
					savedEnv: process.env,
					envDirs,
					cwd,
					write,
				}),
			);
			saving = save.catch(() => {});
			return save;
		}),
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
