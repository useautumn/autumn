import { type CollectionSpec, emitFixture } from "../../generated/emitRuntime";
import { appendToCollection } from "../../surgery/appendToCollection";
import { deleteFixtureLiteral } from "../../surgery/deleteFixtureLiteral";
import { deleteReference } from "../../surgery/deleteReference";
import { leadingIndentOfLine } from "../../surgery/fixtureEdit";
import { replaceFixture } from "../../surgery/replaceFixture";
import { locateFixture } from "./locateFixture";

export type PreviewEntry = { action?: string } & Record<string, unknown>;

export type ApplyPreviewArgs = {
	collection: string;
	spec: CollectionSpec;
	/** The preview's rows for this collection. */
	entries: PreviewEntry[];
	/** The catalog's server rows for this collection. */
	catalogRows: Record<string, unknown>[];
	configPath: string;
	/** In-memory file sources, mutated in place; nothing touches disk here. */
	files: Map<string, string>;
	includeMappings: boolean;
};

export type ApplyPreviewResult = {
	appended: string[];
	replaced: string[];
	deleted: string[];
	/** One printed line per applied change, in the order applied. */
	lines: string[];
	/** Fixtures the preview named that are not plain literals anywhere. */
	unlocated: { id: string; action: string }[];
};

/**
 * The reversal of one collection's preview: a create in the config is deleted
 * from code, a delete on the server is appended, an update is replaced. Pure
 * over the `files` map so tests can assert without touching disk.
 */
export const applyPreview = ({
	collection,
	spec,
	entries,
	catalogRows,
	configPath,
	files,
	includeMappings,
}: ApplyPreviewArgs): ApplyPreviewResult => {
	const result: ApplyPreviewResult = {
		appended: [],
		replaced: [],
		deleted: [],
		lines: [],
		unlocated: [],
	};

	const rowsById = new Map<string, Record<string, unknown>>();
	for (const row of catalogRows) {
		// Archived rows are server history, not something a pull should write.
		if (row.archived === true) continue;
		const id = row[spec.responseIdField];
		if (typeof id === "string") rowsById.set(id, row);
	}

	const removeFixture = ({ id }: { id: string }): void => {
		const located = locateFixture({
			configPath,
			files,
			builder: spec.builder,
			idField: spec.idField,
			id,
		});
		if (located === null) {
			result.unlocated.push({ id, action: "delete from your config" });
			return;
		}
		const removed = deleteFixtureLiteral({
			source: located.source,
			builder: spec.builder,
			idField: spec.idField,
			id,
		});
		if (removed === null) return;
		files.set(located.file, removed.source);
		// A removed export leaves the config importing it — drop those too.
		if (removed.exportedName !== undefined) {
			const configSource = files.get(configPath) ?? "";
			files.set(
				configPath,
				deleteReference({ source: configSource, name: removed.exportedName }),
			);
		}
		result.deleted.push(id);
		result.lines.push(`- ${id}`);
	};

	const appendRow = ({ id }: { id: string }): void => {
		const row = rowsById.get(id);
		if (row === undefined) return;
		const configSource = files.get(configPath) ?? "";
		// The surgery indents the first line; the emitter indents the rest.
		const text = (elementIndent: string) =>
			emitFixture({ spec, row, includeMappings, indent: elementIndent });
		const updated = appendToCollection({
			source: configSource,
			collection,
			text,
		});
		if (updated === null) return;
		files.set(configPath, updated);
		result.appended.push(id);
		result.lines.push(`+ ${id}`);
	};

	const replaceRow = ({ id }: { id: string }): void => {
		const row = rowsById.get(id);
		if (row === undefined) return;
		const located = locateFixture({
			configPath,
			files,
			builder: spec.builder,
			idField: spec.idField,
			id,
		});
		if (located === null) {
			result.unlocated.push({ id, action: "replace with the server's copy" });
			return;
		}
		// The emitter's indent is the found call's own line indent, so the
		// closing `})` lines up with the text it replaces.
		const indent = leadingIndentOfLine(
			located.source,
			located.node.range().start.index,
		);
		const text = emitFixture({ spec, row, includeMappings, indent });
		const updated = replaceFixture({
			source: located.source,
			builder: spec.builder,
			idField: spec.idField,
			id,
			text,
		});
		if (updated === null) return;
		files.set(located.file, updated);
		result.replaced.push(id);
		result.lines.push(`~ ${id}`);
	};

	for (const entry of entries) {
		const id = entry[spec.idField];
		if (typeof id !== "string") continue;
		// `none` and `skip` mean the code already matches the server.
		if (entry.action === "create") removeFixture({ id });
		else if (entry.action === "delete") appendRow({ id });
		else if (entry.action === "update") replaceRow({ id });
	}

	return result;
};
