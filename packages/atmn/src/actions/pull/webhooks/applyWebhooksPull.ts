import { appendWebhook } from "./appendWebhook";
import { deleteWebhook } from "./deleteWebhook";
import type {
	PullFiles,
	RemoteWebhook,
	StatedWebhook,
	WebhookEditResult,
} from "./types";
import { updateWebhook } from "./updateWebhook";

/** The config entry as it reads once this env's endpoint is written into it. */
const statedFrom = ({
	webhook,
	envKey,
}: {
	webhook: RemoteWebhook;
	envKey: string;
}): StatedWebhook => ({
	id: webhook.id,
	env: envKey,
	url: webhook.url,
	events: webhook.events.length > 0 ? webhook.events : undefined,
	description: webhook.description,
	disabled: webhook.disabled,
});

const merge = (target: WebhookEditResult, source: WebhookEditResult): void => {
	target.lines.push(...source.lines);
	target.warnings.push(...source.warnings);
	target.unlocated.push(...source.unlocated);
};

/**
 * One env's endpoints written back into the config, one entry each, found by
 * `(env, id)`. A dashboard endpoint is its own `ep_` id; other envs' entries,
 * comments and ordering stay.
 */
export const applyWebhooksPull = ({
	pull,
	remote,
	stated,
	envKey,
}: {
	pull: PullFiles;
	remote: RemoteWebhook[];
	/** The config's webhooks as evaluated; absent when it states none. */
	stated: StatedWebhook[] | undefined;
	envKey: string;
}): WebhookEditResult & { stated: StatedWebhook[] } => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const rows = stated ?? [];
	const inEnv = new Map(
		rows.filter((row) => row.env === envKey).map((row) => [row.id, row]),
	);
	const next = rows.filter((row) => row.env !== envKey);

	for (const webhook of remote) {
		const row = inEnv.get(webhook.id);
		if (row !== undefined) {
			merge(result, updateWebhook({ pull, webhook, stated: row, envKey }));
			next.push(statedFrom({ webhook, envKey }));
			continue;
		}
		const failure = appendWebhook({ pull, webhook, envKey });
		if (failure !== null) {
			result.unlocated.push({ id: webhook.id, action: failure });
			continue;
		}
		result.lines.push(`+ webhook ${webhook.id} (${envKey})`);
		next.push(statedFrom({ webhook, envKey }));
	}

	const remoteIds = new Set(remote.map(({ id }) => id));
	for (const row of inEnv.values()) {
		if (remoteIds.has(row.id)) continue;
		const removed = deleteWebhook({ pull, stated: row, envKey });
		merge(result, removed);
		// An entry left in the source (unlocated) is still the config's.
		if (removed.lines.length === 0) next.push(row);
	}
	return { ...result, stated: next };
};
