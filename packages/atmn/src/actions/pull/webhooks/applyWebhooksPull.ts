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

const isVercelWebhook = (events: unknown): boolean =>
	Array.isArray(events) &&
	events.length > 0 &&
	events.every(
		(event) => typeof event === "string" && event.startsWith("vercel."),
	);

/** The config as it reads once this env's remote webhook is written into it. */
const statedFrom = ({
	row,
	webhook,
	envKey,
}: {
	row: StatedWebhook | undefined;
	webhook: RemoteWebhook;
	envKey: string;
}): StatedWebhook => ({
	...row,
	id: webhook.id,
	url: { ...row?.url, [envKey]: webhook.url },
	events: webhook.events.length > 0 ? webhook.events : row?.events,
	description: webhook.description,
	disabled: webhook.disabled,
});

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
}): WebhookEditResult & { stated: StatedWebhook[] } => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const statedById = new Map((stated ?? []).map((row) => [row.id, row]));
	// What the next env pulled into the same files sees as the config.
	const next = new Map(statedById);
	// An id the config states is the config's, whatever its shape.
	const fromDashboard = (webhook: RemoteWebhook): boolean =>
		!statedById.has(webhook.id) && isDashboardWebhook(webhook);
	const present = new Set<string>();

	for (const webhook of remote) {
		if (fromDashboard(webhook)) {
			// Vercel and other webhooks live in separate apps: a URL only
			// matches within one.
			const sameApp = (row: StatedWebhook) =>
				isVercelWebhook(row.events) === isVercelWebhook(webhook.events);
			// Another env's copy of this URL fills in this env's key rather than
			// becoming a second webhook.
			const represented =
				(stated ?? []).find(
					(row) => row.url?.[envKey] === webhook.url && sameApp(row),
				) ??
				(stated ?? []).find(
					(row) =>
						row.url?.[envKey] === undefined &&
						Object.values(row.url ?? {}).includes(webhook.url) &&
						sameApp(row),
				);
			if (represented !== undefined) {
				present.add(represented.id);
				next.set(
					represented.id,
					statedFrom({
						row: represented,
						webhook: { ...webhook, id: represented.id },
						envKey,
					}),
				);
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
			if (failure === null) {
				next.set(
					id,
					statedFrom({ row: undefined, webhook: { ...webhook, id }, envKey }),
				);
				result.lines.push(
					`+ webhook ${id} (made in the dashboard; push adopts it by URL)`,
				);
			} else result.unlocated.push({ id, action: failure });
			continue;
		}
		present.add(webhook.id);
		const row = statedById.get(webhook.id);
		next.set(webhook.id, statedFrom({ row, webhook, envKey }));
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
		const removed = removeWebhookEnv({ pull, stated: row, envKey });
		merge(result, removed);
		// A key left in the source (code, or unlocated) is still the config's.
		if (removed.lines.length === 0) continue;
		const { [envKey]: _removed, ...url } = row.url;
		if (Object.keys(url).length === 0) next.delete(row.id);
		else next.set(row.id, { ...row, url });
	}
	return { ...result, stated: [...next.values()] };
};
