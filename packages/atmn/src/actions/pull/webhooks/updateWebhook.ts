import { isDeepStrictEqual } from "node:util";
import { SYNCED_LISTS } from "../../../generated/emit";
import { patchFixturePaths } from "../../../surgery/patchFixturePaths";
import { locateWebhook } from "./locateWebhook";
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
	if (!sameEvents(stated.events, webhook.events))
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

/** Rule 3's wording: what the server holds against what the code evaluates to. */
export const nonLiteralUrlWarning = ({
	id,
	envKey,
	server,
	config,
}: {
	id: string;
	envKey: string;
	server: string | undefined;
	config: unknown;
}): string => {
	const pad = " ".repeat(id.length + 4);
	return [
		`⚠ ${id}  url.${envKey} isn't a plain string, so pull left it untouched`,
		`${pad}server:      ${server ?? "(not registered)"}`,
		`${pad}your config: ${typeof config === "string" ? config : "(no value)"}`,
		`${pad}Update it by hand, or make it a string and pull will manage it.`,
	].join("\n");
};

/**
 * Rules 2 and 3: set or replace `url[envKey]` when it is a string literal (or
 * absent), and bring the other fields in line. Code is never rewritten; a
 * value that evaluates differently from the server earns a warning instead.
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
	const located = locateWebhook({ pull, id: webhook.id });
	if (located === null) {
		result.unlocated.push({
			id: webhook.id,
			action: "update from the server by hand",
		});
		return result;
	}
	const patched = patchFixturePaths({
		source: located.source,
		builder: SPEC.builder,
		idField: SPEC.idField,
		id: webhook.id,
		assignments: [
			{ path: ["url", envKey], text: JSON.stringify(webhook.url) },
			...fieldAssignments({ webhook, stated }),
		],
		bareKeys: true,
	});
	if (patched === null) {
		result.unlocated.push({
			id: webhook.id,
			action: "update from the server by hand",
		});
		return result;
	}
	for (const { path } of patched.skipped) {
		const field = path.join(".");
		if (field !== `url.${envKey}`) {
			result.warnings.push(
				`⚠ ${webhook.id}  ${field} isn't a plain literal, so pull left it untouched`,
			);
			continue;
		}
		const config = stated.url?.[envKey];
		if (config === webhook.url) continue;
		result.warnings.push(
			nonLiteralUrlWarning({
				id: webhook.id,
				envKey,
				server: webhook.url,
				config,
			}),
		);
	}
	if (patched.source === located.source) return result;
	pull.files.set(located.file, patched.source);
	result.lines.push(`~ webhook ${webhook.id}`);
	return result;
};
