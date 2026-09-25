import { isDashboardWebhook } from "../../webhooks/isDashboardWebhook";
import { newWebhookId } from "../../webhooks/newWebhookId";
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
 * A dashboard webhook is matched to the config by URL, never duplicated: the
 * next push adopts it by that URL, keeping its signing secret.
 */
export const applyWebhooksPull = ({
	pull,
	remote,
	stated,
	envKey,
	newId = newWebhookId,
}: {
	pull: PullFiles;
	remote: RemoteWebhook[];
	/** The config's webhooks as evaluated; absent when it states none. */
	stated: StatedWebhook[] | undefined;
	envKey: string;
	/** Mints the id a dashboard webhook is written under. */
	newId?: () => string;
}): WebhookEditResult => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const statedById = new Map((stated ?? []).map((row) => [row.id, row]));
	// An id the config states is the config's, whatever its shape.
	const fromDashboard = (webhook: RemoteWebhook): boolean =>
		!statedById.has(webhook.id) && isDashboardWebhook(webhook);
	const present = new Set<string>();

	for (const webhook of remote) {
		if (fromDashboard(webhook)) {
			const represented = (stated ?? []).find(
				(row) => row.url?.[envKey] === webhook.url,
			);
			if (represented !== undefined) {
				present.add(represented.id);
				merge(
					result,
					updateWebhook({
						pull,
						webhook: { ...webhook, id: represented.id },
						stated: represented,
						envKey,
					}),
				);
				continue;
			}
			if (webhook.events.length === 0) {
				result.lines.push(
					`· webhook ${webhook.id} receives every event; give it an event list in the dashboard, or add it to your config, to manage it here`,
				);
				continue;
			}
			const id = newId();
			const failure = appendWebhook({
				pull,
				webhook: { ...webhook, id },
				envKey,
			});
			if (failure === null)
				result.lines.push(
					`+ webhook ${id} (made in the dashboard; push adopts it by URL)`,
				);
			else result.unlocated.push({ id, action: failure });
			continue;
		}
		present.add(webhook.id);
		const row = statedById.get(webhook.id);
		if (row !== undefined) {
			merge(result, updateWebhook({ pull, webhook, stated: row, envKey }));
			continue;
		}
		const failure = appendWebhook({ pull, webhook, envKey });
		if (failure === null) result.lines.push(`+ webhook ${webhook.id}`);
		else result.unlocated.push({ id: webhook.id, action: failure });
	}

	for (const row of stated ?? []) {
		if (present.has(row.id) || row.url?.[envKey] === undefined) continue;
		merge(result, removeWebhookEnv({ pull, stated: row, envKey }));
	}
	return result;
};
