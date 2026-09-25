import { isDashboardWebhook } from "../../webhooks/isDashboardWebhook";
import { appendWebhook } from "./appendWebhook";
import { removeWebhookEnv } from "./removeWebhookEnv";
import type {
	PullFiles,
	RemoteWebhook,
	StatedWebhook,
	WebhookEditResult,
} from "./types";
import { updateWebhook } from "./updateWebhook";

const merge = (target: WebhookEditResult, source: WebhookEditResult): void => {
	target.lines.push(...source.lines);
	target.warnings.push(...source.warnings);
	target.unlocated.push(...source.unlocated);
};

/**
 * One env's webhooks written back into the config. Only `url[envKey]` is
 * touched on the url map; every other env's key, comment and ordering stays.
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
}): WebhookEditResult => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const statedById = new Map((stated ?? []).map((row) => [row.id, row]));
	// An id the config states is the config's, whatever its shape.
	const fromDashboard = (webhook: RemoteWebhook): boolean =>
		!statedById.has(webhook.id) && isDashboardWebhook(webhook);
	const managed = remote.filter((webhook) => !fromDashboard(webhook));

	for (const webhook of remote.filter(fromDashboard))
		result.lines.push(
			`· webhook ${webhook.id} was made in the dashboard; your config doesn't manage it`,
		);

	for (const webhook of managed) {
		const row = statedById.get(webhook.id);
		if (row !== undefined) {
			merge(result, updateWebhook({ pull, webhook, stated: row, envKey }));
			continue;
		}
		const failure = appendWebhook({ pull, webhook, envKey });
		if (failure === null) result.lines.push(`+ webhook ${webhook.id}`);
		else result.unlocated.push({ id: webhook.id, action: failure });
	}

	const remoteIds = new Set(managed.map((webhook) => webhook.id));
	for (const row of stated ?? []) {
		if (remoteIds.has(row.id) || row.url?.[envKey] === undefined) continue;
		merge(result, removeWebhookEnv({ pull, stated: row, envKey }));
	}
	return result;
};
