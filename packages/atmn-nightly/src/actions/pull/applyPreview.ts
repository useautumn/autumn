import { type CollectionSpec, emitFixture } from "../../generated/emitRuntime";
import { appendToCollection } from "../../surgery/appendToCollection";
import { deleteFixtureLiteral } from "../../surgery/deleteFixtureLiteral";
import { deleteReference } from "../../surgery/deleteReference";
import { leadingIndentOfLine } from "../../surgery/fixtureEdit";
import { insertCollection } from "../../surgery/insertCollection";
import { replaceFixture } from "../../surgery/replaceFixture";
import { type FixtureConstraint, locateFixture } from "./locateFixture";
import { activeVersionOf, routePlanRow } from "./routePlanRow";

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

	// Versioned collections key rows by id AND slug; a row without a slug is v1.
	const versioned = spec.historyKey !== undefined;
	const slugOf = (row: Record<string, unknown>): string =>
		typeof row.versionSlug === "string" ? row.versionSlug : "v1";
	const keyOf = ({ id, slug }: { id: string; slug: string }): string =>
		versioned ? `${id}@${slug}` : id;

	const rowsById = new Map<string, Record<string, unknown>>();
	const rowsByPlan = new Map<string, Record<string, unknown>[]>();
	for (const row of catalogRows) {
		// Archived rows are server history, not something a pull should write.
		if (row.archived === true) continue;
		const id = row[spec.responseIdField];
		if (typeof id !== "string") continue;
		rowsById.set(keyOf({ id, slug: slugOf(row) }), row);
		rowsByPlan.set(id, [...(rowsByPlan.get(id) ?? []), row]);
	}

	const constraintsFor = (
		entry: PreviewEntry,
	): FixtureConstraint[] | undefined =>
		versioned
			? [{ field: "versionSlug", equals: slugOf(entry), absentMeans: "v1" }]
			: undefined;
	const internalIdOf = (entry: PreviewEntry): string | null =>
		typeof entry.internalId === "string" ? entry.internalId : null;

	const removeFixture = ({
		id,
		entry,
	}: {
		id: string;
		entry: PreviewEntry;
	}): void => {
		const located = locateFixture({
			configPath,
			files,
			builder: spec.builder,
			idField: spec.idField,
			id,
			internalId: internalIdOf(entry),
			where: constraintsFor(entry),
		});
		if (located === null) {
			result.unlocated.push({ id, action: "delete from your config" });
			return;
		}
		const removed = deleteFixtureLiteral({
			source: located.source,
			builder: spec.builder,
			idField: located.idField,
			id: located.id,
			where: located.where,
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

	const appendRow = ({
		id,
		entry,
	}: {
		id: string;
		entry: PreviewEntry;
	}): void => {
		const row = rowsById.get(keyOf({ id, slug: slugOf(entry) }));
		if (row === undefined) return;
		let target = collection;
		let emitted: Record<string, unknown> = row;
		if (versioned) {
			const route = routePlanRow({
				row: row as { active?: boolean; version?: number },
				activeVersion: activeVersionOf({
					rows: (rowsByPlan.get(id) ?? []) as {
						active?: boolean;
						version?: number;
					}[],
				}),
			});
			target =
				route.collection === "plans"
					? collection
					: (spec.historyKey ?? collection);
			// Variants come back nested under their base; pulling them is later work.
			// Membership says active; only a draft spells it out.
			// Variants stay nested: that is the form the server edits them through.
			const { active: _stamped, ...bare } = row;
			emitted = route.draft ? { ...bare, active: false } : bare;
		}
		let configSource = files.get(configPath) ?? "";
		// A config that never mentioned the collection gets the key, then the row.
		const withKey = insertCollection({
			source: configSource,
			collection: target,
		});
		if (withKey === null) return;
		configSource = withKey;
		// The surgery indents the first line; the emitter indents the rest.
		const text = (elementIndent: string) =>
			emitFixture({
				spec,
				row: emitted,
				includeMappings,
				indent: elementIndent,
			});
		const updated = appendToCollection({
			source: configSource,
			collection: target,
			text,
		});
		if (updated === null) return;
		files.set(configPath, updated);
		result.appended.push(versioned ? keyOf({ id, slug: slugOf(entry) }) : id);
		result.lines.push(
			`+ ${versioned ? keyOf({ id, slug: slugOf(entry) }) : id}`,
		);
	};

	const replaceRow = ({
		id,
		entry,
	}: {
		id: string;
		entry: PreviewEntry;
	}): void => {
		const row = rowsById.get(keyOf({ id, slug: slugOf(entry) }));
		if (row === undefined) return;
		const located = locateFixture({
			configPath,
			files,
			builder: spec.builder,
			idField: spec.idField,
			id,
			internalId: internalIdOf(entry),
			where: constraintsFor(entry),
		});
		if (located === null) {
			// A version the config never had is missing, not unlocatable.
			if (versioned) {
				appendRow({ id, entry });
				return;
			}
			result.unlocated.push({ id, action: "replace with the server's copy" });
			return;
		}
		// A version's array is its state: a row that stopped being active belongs
		// in history now, so versioned rows are re-placed rather than rewritten.
		if (versioned) {
			const removed = deleteFixtureLiteral({
				source: located.source,
				builder: spec.builder,
				idField: located.idField,
				id: located.id,
				where: located.where,
			});
			if (removed === null) return;
			files.set(located.file, removed.source);
			if (removed.exportedName !== undefined) {
				const configSource = files.get(configPath) ?? "";
				files.set(
					configPath,
					deleteReference({ source: configSource, name: removed.exportedName }),
				);
			}
			appendRow({ id, entry });
			result.appended.pop();
			result.lines.pop();
			result.replaced.push(keyOf({ id, slug: slugOf(entry) }));
			result.lines.push(`~ ${keyOf({ id, slug: slugOf(entry) })}`);
			return;
		}
		const emitted = row;
		// The emitter's indent is the found call's own line indent, so the
		// closing `})` lines up with the text it replaces.
		const indent = leadingIndentOfLine(
			located.source,
			located.node.range().start.index,
		);
		const text = emitFixture({ spec, row: emitted, includeMappings, indent });
		const updated = replaceFixture({
			source: located.source,
			builder: spec.builder,
			idField: located.idField,
			id: located.id,
			where: located.where,
			text,
		});
		if (updated === null) return;
		files.set(located.file, updated);
		result.replaced.push(id);
		result.lines.push(`~ ${id}`);
	};

	// The preview speaks for what the config states. A version the config never
	// mentions is still the server's truth, so versioned rows the config has no
	// fixture for are appended straight from the catalog.
	const appendUnstatedVersions = (): void => {
		if (!versioned) return;
		for (const row of rowsById.values()) {
			const id = row[spec.responseIdField];
			if (typeof id !== "string") continue;
			const slug = slugOf(row);
			const stated = entries.some(
				(entry) => entry[spec.idField] === id && slugOf(entry) === slug,
			);
			if (stated) continue;
			const located = locateFixture({
				configPath,
				files,
				builder: spec.builder,
				idField: spec.idField,
				id,
				internalId: typeof row.internalId === "string" ? row.internalId : null,
				where: [{ field: "versionSlug", equals: slug, absentMeans: "v1" }],
			});
			if (located === null) appendRow({ id, entry: { versionSlug: slug } });
		}
	};

	for (const entry of entries) {
		const id = entry[spec.idField];
		if (typeof id !== "string") continue;
		// `none` and `skip` mean the code already matches the server.
		if (entry.action === "create") removeFixture({ id, entry });
		else if (entry.action === "delete") appendRow({ id, entry });
		else if (entry.action === "update") replaceRow({ id, entry });
	}
	appendUnstatedVersions();

	return result;
};
