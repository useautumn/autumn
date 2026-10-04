import type { TrackBatchItemResult } from "@autumn/balance-worker-client/protocol";

// State rows, tables and slimmed catalogs are copy-on-write: a write replaces what it changes and keeps
// every other object, so an object's JSON is computed once and reused by every later reply carrying it.
const objectJson = new WeakMap<object, string>();

// A reply filters these tables per feature, so the array is new each time but most of its rows are not.
const FILTERED_TABLES = new Set([
	"customerEntitlements",
	"rollovers",
	"replaceables",
]);

const keyJson = new Map<string, string>();

function memberPrefixOf(key: string): string {
	let prefix = keyJson.get(key);
	if (prefix === undefined) {
		prefix = `${JSON.stringify(key)}:`;
		keyJson.set(key, prefix);
	}
	return prefix;
}

function jsonOnceOf(value: object): string {
	let json = objectJson.get(value);
	if (json === undefined) {
		json = JSON.stringify(value);
		objectJson.set(value, json);
	}
	return json;
}

/** JSON.stringify's rule for a value inside an object: undefined, functions and symbols leave the key out. */
function omitsValue(value: unknown): boolean {
	return (
		value === undefined ||
		typeof value === "function" ||
		typeof value === "symbol"
	);
}

function jsonOfValue(value: unknown): string {
	if (typeof value === "object" && value !== null) return jsonOnceOf(value);
	return JSON.stringify(value);
}

function jsonOfRows(rows: unknown[]): string {
	let json = "[";
	for (let index = 0; index < rows.length; index++) {
		if (index > 0) json += ",";
		const row = rows[index];
		json += omitsValue(row) ? "null" : jsonOfValue(row);
	}
	return `${json}]`;
}

/** Filtered tables are joined row by row; every other table and single row is the state's own object. */
function jsonOfState(state: Record<string, unknown>): string {
	let json = "{";
	let first = true;
	for (const key in state) {
		const value = state[key];
		if (omitsValue(value)) continue;
		if (!first) json += ",";
		first = false;
		json += memberPrefixOf(key);
		json +=
			FILTERED_TABLES.has(key) && Array.isArray(value)
				? jsonOfRows(value)
				: jsonOfValue(value);
	}
	return `${json}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!("toJSON" in value)
	);
}

/** Exactly `JSON.stringify(reply)`, with the subject's unchanged objects reused rather than re-serialised. */
export function serializeSubjectReply({ reply }: { reply: object }): string {
	let json = "{";
	let first = true;
	for (const key in reply) {
		const value = (reply as Record<string, unknown>)[key];
		if (omitsValue(value)) continue;
		if (!first) json += ",";
		first = false;
		json += memberPrefixOf(key);
		if (key === "state" && isPlainObject(value)) json += jsonOfState(value);
		// A reply's slimmed catalog is shared while the subject's layout holds.
		else if (key === "catalog" && isPlainObject(value))
			json += jsonOnceOf(value);
		else json += JSON.stringify(value);
	}
	return `${json}}`;
}

/** Exactly `JSON.stringify({ results })`, each reply serialised as `serializeSubjectReply` does. */
export function serializeTrackBatchReply({
	results,
}: {
	results: TrackBatchItemResult[];
}): string {
	let json = '{"results":[';
	for (let index = 0; index < results.length; index++) {
		if (index > 0) json += ",";
		const result = results[index];
		json += result?.ok
			? `{"ok":true,"reply":${serializeSubjectReply({ reply: result.reply })}}`
			: JSON.stringify(result);
	}
	return `${json}]}`;
}
