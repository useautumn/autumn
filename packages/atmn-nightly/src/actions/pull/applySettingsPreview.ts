import type { SingletonSpec } from "../../generated/emitRuntime";
import type { SettingChange } from "../../render/renderPreview";
import {
	insertSingleton,
	patchSingletonProperty,
	type SingletonBlock,
} from "../../surgery/patchSingletonProperty";
import { resolveCollectionTarget } from "./resolveCollectionTarget";

export type ApplySettingsResult = {
	/** One printed line per key changed, in the order applied. */
	lines: string[];
	/** Keys the config could not take an edit for. */
	unlocated: string[];
};

/** The file and literal the block lives in: inline, a local const, or an
 * imported one — like a collection's array. Null when it is none of these. */
const locateBlock = ({
	singleton,
	configPath,
	files,
}: {
	singleton: string;
	configPath: string;
	files: Map<string, string>;
}): { file: string; block: SingletonBlock } | null => {
	const target = resolveCollectionTarget({
		configPath,
		files,
		collection: singleton,
		kind: "object",
	});
	if (target === null) return null;
	return target.kind === "inline"
		? { file: target.file, block: { kind: "inline", singleton } }
		: { file: target.file, block: { kind: "binding", name: target.name } };
};

/**
 * The reversal of a settings preview: the block ends up stating every
 * non-default flag the server holds, and none at its default — an absent
 * flag already reads as its default. `update` says the config states the
 * wrong value; `unmanaged` says it states none and the server holds a
 * non-default; a stated flag the preview is silent on matches the server,
 * and goes only when that shared value is the default.
 */
export const applySettingsPreview = ({
	singleton,
	spec,
	changes,
	stated,
	configPath,
	files,
}: {
	singleton: string;
	spec: SingletonSpec;
	changes: SettingChange[];
	/** The block's wire body as the config states it, if any. */
	stated: Record<string, unknown> | undefined;
	configPath: string;
	files: Map<string, string>;
}): ApplySettingsResult => {
	const result: ApplySettingsResult = { lines: [], unlocated: [] };
	const serverValueOf = new Map<string, unknown>();
	for (const change of changes) {
		if (change.key !== undefined)
			serverValueOf.set(change.key, change.previous);
	}
	for (const [wireKey, value] of Object.entries(stated ?? {})) {
		if (!serverValueOf.has(wireKey)) serverValueOf.set(wireKey, value);
	}

	const edits = spec.fields.flatMap((field) => {
		if (!serverValueOf.has(field.wireKey)) return [];
		const serverValue = serverValueOf.get(field.wireKey);
		const text =
			serverValue === field.default ? null : JSON.stringify(serverValue);
		return [{ key: field.key, text }];
	});
	// A block the config never had is seeded only when there is a value to
	// put in it: `settings: {}` manages nothing.
	if (edits.some((edit) => edit.text !== null)) {
		const seeded = insertSingleton({
			source: files.get(configPath) ?? "",
			singleton,
		});
		if (seeded !== null) files.set(configPath, seeded);
	}

	for (const edit of edits) {
		const located = locateBlock({ singleton, configPath, files });
		if (located === null) {
			// A value to write needs a literal to land in; a removal from a block
			// that cannot be found is a flag already stated by other means.
			if (edit.text !== null) result.unlocated.push(edit.key);
			continue;
		}
		const source = files.get(located.file) ?? "";
		const updated = patchSingletonProperty({
			source,
			block: located.block,
			edit,
		});
		if (updated === null) {
			result.unlocated.push(edit.key);
			continue;
		}
		if (updated === source) continue;
		files.set(located.file, updated);
		result.lines.push(`~ ${singleton}.${edit.key}`);
	}
	return result;
};
