import type { SingletonSpec } from "../../generated/emitRuntime";
import type { SettingChange } from "../../render/renderPreview";
import { patchSingletonProperty } from "../../surgery/patchSingletonProperty";

export type ApplySettingsResult = {
	/** One printed line per key changed, in the order applied. */
	lines: string[];
	/** Keys the config could not take an edit for. */
	unlocated: string[];
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

	for (const field of spec.fields) {
		if (!serverValueOf.has(field.wireKey)) continue;
		const serverValue = serverValueOf.get(field.wireKey);
		const text =
			serverValue === field.default ? null : JSON.stringify(serverValue);
		const source = files.get(configPath) ?? "";
		const updated = patchSingletonProperty({
			source,
			singleton,
			edit: { key: field.key, text },
		});
		if (updated === null) {
			result.unlocated.push(field.key);
			continue;
		}
		if (updated === source) continue;
		files.set(configPath, updated);
		result.lines.push(`~ ${singleton}.${field.key}`);
	}
	return result;
};
