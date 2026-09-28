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

const listed = (items: string[]): string =>
	items.length === 1
		? items[0]
		: `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const frozenFieldsWarning = ({
	id,
	fields,
	envKey,
	unreadEnvKeys,
}: {
	id: string;
	fields: string[];
	envKey: string;
	unreadEnvKeys: string[];
}): string =>
	`⚠ ${id}: ${listed(fields)} ${fields.length === 1 && fields[0] !== "events" ? "differs" : "differ"} in ${envKey}; ${listed(unreadEnvKeys)} ${unreadEnvKeys.length === 1 ? "wasn't" : "weren't"} read, so left unchanged`;

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
	unreadEnvKeys,
}: {
	pull: PullFiles;
	webhook: RemoteWebhook;
	stated: StatedWebhook;
	envKey: string;
	/** Url-map envs this pull didn't read: shared fields then stay as stated. */
	unreadEnvKeys: string[];
}): WebhookEditResult => {
	const result: WebhookEditResult = {
		lines: [],
		warnings: [],
		unlocated: [],
		frozen: [],
	};
	const located = locateWebhook({ pull, id: webhook.id });
	if (located === null) {
		result.unlocated.push({
			id: webhook.id,
			action: "update from the server by hand",
		});
		return result;
	}
	const shared = fieldAssignments({ webhook, stated });
	const frozen = unreadEnvKeys.length > 0;
	// `events: []` and no list both mean every event: only a normalisation.
	const differing = shared.filter(
		({ path }) =>
			!(
				path[0] === "events" &&
				Array.isArray(stated.events) &&
				stated.events.length === 0 &&
				webhook.events.length === 0
			),
	);
	if (frozen && differing.length > 0)
		result.frozen.push({
			id: webhook.id,
			warning: frozenFieldsWarning({
				id: webhook.id,
				fields: differing.map(({ path }) => path.join(".")),
				envKey,
				unreadEnvKeys,
			}),
		});
	const patched = patchFixturePaths({
		source: located.source,
		builder: SPEC.builder,
		idField: SPEC.idField,
		id: webhook.id,
		assignments: [
			{ path: ["url", envKey], text: JSON.stringify(webhook.url) },
			...(frozen ? [] : shared),
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
