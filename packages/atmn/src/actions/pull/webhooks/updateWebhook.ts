import { isDeepStrictEqual } from "node:util";
import { SYNCED_LISTS } from "../../../generated/emit";
import { patchFixturePaths } from "../../../surgery/patchFixturePaths";
import { locateWebhook, webhookWhere } from "./locateWebhook";
import type {
	PullFiles,
	RemoteWebhook,
	StatedWebhook,
	WebhookEditResult,
} from "./types";

const SPEC = SYNCED_LISTS.webhooks;

type Assignment = { path: string[]; text: string | null };

const sameEvents = (left: unknown, right: readonly string[]): boolean =>
	Array.isArray(left) && isDeepStrictEqual([...left].sort(), [...right].sort());

/** Settings-style: a field moves only when the server holds something else. */
const fieldAssignments = ({
	webhook,
	stated,
}: {
	webhook: RemoteWebhook;
	stated: StatedWebhook;
}): Assignment[] => {
	const assignments: Assignment[] = [];
	// No list is every event, which a config states by leaving `events` out.
	if (webhook.events.length === 0) {
		if (stated.events !== undefined)
			assignments.push({ path: ["events"], text: null });
	} else if (!sameEvents(stated.events, webhook.events))
		assignments.push({
			path: ["events"],
			text: `[${webhook.events.map((event) => JSON.stringify(event)).join(", ")}]`,
		});
	if ((stated.description ?? "") !== (webhook.description ?? ""))
		assignments.push({
			path: ["description"],
			text: webhook.description ? JSON.stringify(webhook.description) : null,
		});
	if ((stated.disabled === true) !== webhook.disabled)
		assignments.push({
			path: ["disabled"],
			text: webhook.disabled ? "true" : null,
		});
	return assignments;
};

/** What the server holds against what the code evaluates to. */
const nonLiteralUrlWarning = ({
	id,
	envKey,
	server,
	config,
}: {
	id: string;
	envKey: string;
	server: string;
	config: unknown;
}): string => {
	const pad = " ".repeat(id.length + 4);
	return [
		`⚠ ${id} (${envKey})  url isn't a plain string, so pull left it untouched`,
		`${pad}server:      ${server}`,
		`${pad}your config: ${typeof config === "string" ? config : "(no value)"}`,
		`${pad}Update it by hand, or make it a string and pull will manage it.`,
	].join("\n");
};

/**
 * Set a string-literal url and bring the other fields in line with the server.
 * Code is never rewritten; a value that evaluates differently earns a warning.
 */
export const updateWebhook = ({
	pull,
	webhook,
	stated,
	envKey,
}: {
	pull: PullFiles;
	webhook: RemoteWebhook;
	stated: StatedWebhook;
	envKey: string;
}): WebhookEditResult => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const label = `${webhook.id} (${envKey})`;
	const located = locateWebhook({ pull, id: webhook.id, envKey });
	const patched =
		located === null
			? null
			: patchFixturePaths({
					source: located.source,
					builder: SPEC.builder,
					idField: SPEC.idField,
					id: webhook.id,
					where: webhookWhere({ envKey }),
					assignments: [
						{ path: ["url"], text: JSON.stringify(webhook.url) },
						...fieldAssignments({ webhook, stated }),
					],
					bareKeys: true,
				});
	if (located === null || patched === null) {
		result.unlocated.push({
			id: webhook.id,
			action: `update the ${envKey} webhook from the server by hand`,
		});
		return result;
	}
	for (const { path } of patched.skipped) {
		const field = path.join(".");
		if (field !== "url") {
			result.warnings.push(
				`⚠ ${label}  ${field} isn't a plain literal, so pull left it untouched`,
			);
			continue;
		}
		if (stated.url === webhook.url) continue;
		result.warnings.push(
			nonLiteralUrlWarning({
				id: webhook.id,
				envKey,
				server: webhook.url,
				config: stated.url,
			}),
		);
	}
	if (patched.source === located.source) return result;
	pull.files.set(located.file, patched.source);
	result.lines.push(`~ webhook ${label}`);
	return result;
};
