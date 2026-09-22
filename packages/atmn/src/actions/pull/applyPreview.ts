import type { SgNode } from "@ast-grep/napi";
import { NESTED_FIXTURES } from "../../generated/emit";
import {
	branchSpecs,
	type CollectionSpec,
	emitFixture,
	emitFixtureProperty,
	emitNestedFixture,
	resolveBranch,
} from "../../generated/emitRuntime";
import { appendToBinding } from "../../surgery/appendToBinding";
import { appendToCollection } from "../../surgery/appendToCollection";
import { appendToFixtureArray } from "../../surgery/appendToFixtureArray";
import { deleteFixtureLiteral } from "../../surgery/deleteFixtureLiteral";
import { deleteReference } from "../../surgery/deleteReference";
import { ensureBuilderImport } from "../../surgery/ensureBuilderImport";
import { leadingIndentOfLine } from "../../surgery/fixtureEdit";
import {
	insertCollection,
	rootSpreadNames,
} from "../../surgery/insertCollection";
import {
	fixturePropertyString,
	patchFixtureProperty,
} from "../../surgery/patchFixtureProperty";
import { replaceFixture } from "../../surgery/replaceFixture";
import { changedFixtureKeys } from "./changedFixtureKeys";
import { type FixtureConstraint, locateFixture } from "./locateFixture";
import { resolveCollectionTarget } from "./resolveCollectionTarget";

export type PreviewEntry = { action?: string } & Record<string, unknown>;

const NESTED_VARIANT = NESTED_FIXTURES.variants;
const nestedVariantEdges = (
	row: Record<string, unknown>,
): Record<string, unknown>[] =>
	Array.isArray(row[NESTED_VARIANT.path])
		? (row[NESTED_VARIANT.path] as Record<string, unknown>[])
		: [];

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
	featureTypes?: Readonly<Record<string, string>>;
	nestedBuilders?: Readonly<Record<string, string>>;
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
	featureTypes,
	nestedBuilders,
}: ApplyPreviewArgs): ApplyPreviewResult => {
	const result: ApplyPreviewResult = {
		appended: [],
		replaced: [],
		deleted: [],
		lines: [],
		unlocated: [],
	};
	// Versioned collections key rows by id AND slug; a row without a slug is v1.
	const versioned = spec.versioned === true;
	const slugOf = (row: Record<string, unknown>): string =>
		typeof row.versionSlug === "string" ? row.versionSlug : "v1";
	const keyOf = ({ id, slug }: { id: string; slug: string }): string =>
		versioned ? `${id}@${slug}` : id;

	// A union item is addressed through its branch: the builder, the id field
	// and the fixture keys are the branch's, not the collection's.
	const specFor = (row: Record<string, unknown>): CollectionSpec =>
		resolveBranch({ spec, row }).spec;
	const bodyOf = (row: Record<string, unknown>): Record<string, unknown> =>
		resolveBranch({ spec, row }).row;
	const idOfRow = (row: Record<string, unknown>): unknown =>
		bodyOf(row)[specFor(row).responseIdField];

	const rowsById = new Map<string, Record<string, unknown>>();
	// A variant row lives in its parent's `variants[]`, never top-level: the
	// preview still names it by its own plan id and slug, so it is indexed too.
	const nestedRowsById = new Map<
		string,
		{ edge: Record<string, unknown>; parent: Record<string, unknown> }
	>();
	for (const row of catalogRows) {
		// Archived rows are server history, not something a pull should write.
		if (row.archived === true) continue;
		const id = idOfRow(row);
		if (typeof id !== "string") continue;
		rowsById.set(keyOf({ id, slug: slugOf(row) }), row);
		for (const edge of nestedVariantEdges(row)) {
			const variantId = edge[NESTED_VARIANT.idField];
			if (typeof variantId !== "string") continue;
			nestedRowsById.set(keyOf({ id: variantId, slug: slugOf(edge) }), {
				edge,
				parent: row,
			});
		}
	}

	const constraintsFor = (
		entry: PreviewEntry,
	): FixtureConstraint[] | undefined =>
		versioned
			? [{ field: "versionSlug", equals: slugOf(entry), absentMeans: "v1" }]
			: undefined;
	const internalIdOf = (entry: PreviewEntry): string | null =>
		typeof entry.internalId === "string" ? entry.internalId : null;
	const ensureNestedBuilderImports = ({
		file,
		row,
	}: {
		file: string;
		row: Record<string, unknown>;
	}): void => {
		for (const [path, builder] of Object.entries(nestedBuilders ?? {})) {
			if (!Array.isArray(row[path]) || row[path].length === 0) continue;
			files.set(
				file,
				ensureBuilderImport({
					source: files.get(file) ?? "",
					builder,
					collection: path,
				}),
			);
		}
	};
	const deleteExportReferences = ({ name }: { name: string }): void => {
		const referenceFiles = new Set([configPath]);
		const target = resolveCollectionTarget({ configPath, files, collection });
		if (target !== null) referenceFiles.add(target.file);
		for (const file of referenceFiles) {
			files.set(file, deleteReference({ source: files.get(file) ?? "", name }));
		}
	};

	const removeFixture = ({
		id,
		entry,
	}: {
		id: string;
		entry: PreviewEntry;
	}): void => {
		let entrySpec = spec;
		let located: ReturnType<typeof locateFixture> = null;
		for (const candidate of branchSpecs({ spec })) {
			located = locateFixture({
				configPath,
				files,
				builder: candidate.builder,
				idField: candidate.idField,
				id,
				internalId: internalIdOf(entry),
				where: constraintsFor(entry),
			});
			if (located !== null) {
				entrySpec = candidate;
				break;
			}
		}
		if (located === null) {
			result.unlocated.push({ id, action: "delete from your config" });
			return;
		}
		const removed = deleteFixtureLiteral({
			source: located.source,
			builder: entrySpec.builder,
			idField: located.idField,
			id: located.id,
			where: located.where,
		});
		if (removed === null) return;
		files.set(located.file, removed.source);
		if (removed.exportedName !== undefined)
			deleteExportReferences({ name: removed.exportedName });
		result.deleted.push(id);
		result.lines.push(`- ${id}`);
	};

	/** A server-only variant version goes back where the server holds it: its parent's `variants[]`. */
	const appendNestedVariant = ({
		key,
		entry,
	}: {
		key: string;
		entry: PreviewEntry;
	}): boolean => {
		const nested = nestedRowsById.get(key);
		if (nested === undefined) return false;
		const { edge, parent } = nested;
		const parentId = idOfRow(parent);
		if (typeof parentId !== "string") return false;
		const parentSpec = specFor(parent);
		const alreadyStated =
			locateFixture({
				configPath,
				files,
				builder: {
					parentBuilder: parentSpec.builder,
					arrayProperty: NESTED_VARIANT.path,
				},
				idField: NESTED_VARIANT.idField,
				id: String(edge[NESTED_VARIANT.idField]),
				internalId:
					typeof edge.internalId === "string" ? edge.internalId : null,
				where: constraintsFor(entry),
			}) !== null;
		if (alreadyStated) return false;
		const located = locateFixture({
			configPath,
			files,
			builder: parentSpec.builder,
			idField: parentSpec.idField,
			id: parentId,
			internalId:
				typeof parent.internalId === "string" ? parent.internalId : null,
			where: [
				{ field: "versionSlug", equals: slugOf(parent), absentMeans: "v1" },
			],
			allowDynamic: true,
		});
		if (located === null) return false;
		const text = (elementIndent: string) =>
			emitNestedFixture({
				spec: parentSpec,
				path: NESTED_VARIANT.path,
				row: edge,
				includeMappings,
				indent: elementIndent,
				context: { featureTypes, nestedBuilders },
			});
		const updated = appendToFixtureArray({
			source: located.source,
			builder: located.builder,
			idField: located.idField,
			id: located.id,
			where: located.where,
			property: NESTED_VARIANT.path,
			text,
		});
		if (updated === null) return false;
		files.set(
			located.file,
			ensureBuilderImport({
				source: updated,
				builder: NESTED_VARIANT.builder,
				collection: NESTED_VARIANT.path,
			}),
		);
		result.appended.push(key);
		result.lines.push(`+ ${key}`);
		return true;
	};

	const appendRow = ({
		id,
		entry,
	}: {
		id: string;
		entry: PreviewEntry;
	}): boolean => {
		const key = keyOf({ id, slug: slugOf(entry) });
		const row = rowsById.get(key);
		if (row === undefined) return appendNestedVariant({ key, entry });
		const rowSpec = specFor(row);
		const locatedEntry =
			typeof row.internalId === "string"
				? { ...entry, internalId: row.internalId }
				: entry;
		if (
			versioned &&
			locateFixture({
				configPath,
				files,
				builder: rowSpec.builder,
				idField: rowSpec.idField,
				id,
				internalId: internalIdOf(locatedEntry),
				where: constraintsFor(locatedEntry),
			}) !== null
		) {
			replaceRow({ id, entry: locatedEntry });
			return true;
		}
		// A config that never mentioned the collection gets the key, then the row.
		// Unless the object spreads another one: the key may live there, and a
		// second `features:` after the spread would silently override it.
		const configSource = files.get(configPath) ?? "";
		const withKey = insertCollection({ source: configSource, collection });
		if (withKey === null) return false;
		const spreads = rootSpreadNames({ source: configSource });
		if (withKey !== configSource && spreads.length > 0) {
			result.unlocated.push({
				id: key,
				action: `append to \`${collection}\` by hand: atmn() spreads \`${spreads.join("`, `")}\`, which may already hold it`,
			});
			return false;
		}
		files.set(configPath, withKey);
		// The array may be a const the config names, in this file or an imported one.
		const resolved = resolveCollectionTarget({ configPath, files, collection });
		if (resolved === null) {
			result.unlocated.push({
				id: key,
				action: `append to \`${collection}\` by hand: it is not an array literal`,
			});
			return false;
		}
		// The surgery indents the first line; the emitter indents the rest.
		const text = (elementIndent: string) =>
			emitFixture({
				spec,
				row,
				includeMappings,
				indent: elementIndent,
				context: { featureTypes, nestedBuilders },
			});
		const targetSource = files.get(resolved.file) ?? "";
		// Versions of one plan sit together: a new one lands after its siblings.
		const after = versioned
			? (element: SgNode) =>
					element.kind() === "call_expression" &&
					element.field("function")?.text() === rowSpec.builder &&
					fixturePropertyString({
						call: element,
						property: rowSpec.idField,
					}) === id
			: undefined;
		const updated =
			resolved.kind === "inline"
				? appendToCollection({ source: targetSource, collection, text, after })
				: appendToBinding({
						source: targetSource,
						name: resolved.name,
						text,
						after,
					});
		if (updated === null) {
			result.unlocated.push({
				id: key,
				action: `append to \`${collection}\` by hand: it is not an array literal`,
			});
			return false;
		}
		// The file now holds an inline literal, so it must import the builder.
		files.set(
			resolved.file,
			ensureBuilderImport({
				source: updated,
				builder: rowSpec.builder,
				collection,
			}),
		);
		ensureNestedBuilderImports({ file: resolved.file, row });
		result.appended.push(key);
		result.lines.push(`+ ${key}`);
		return true;
	};

	const patchChangedProperties = ({
		entry,
		row,
		indent,
		located,
		rowSpec,
	}: {
		entry: PreviewEntry;
		row: Record<string, unknown>;
		indent: string;
		located: NonNullable<ReturnType<typeof locateFixture>>;
		rowSpec: CollectionSpec;
	}): string | null => {
		// The fixture may have been found by its stable id; the public id it
		// states is what a rename has to move.
		const keys = changedFixtureKeys({
			spec: rowSpec,
			entry,
			includeMappings,
			fixtureId: fixturePropertyString({
				call: located.node,
				property: rowSpec.idField,
			}),
			rowId: bodyOf(row)[rowSpec.responseIdField],
		});
		if (keys === null) return null;
		let source = located.source;
		// Identity keys come last, and the slug moves before the id, so every
		// lookup still finds the fixture by what the config said before.
		let where = located.where;
		for (const property of keys) {
			const text = emitFixtureProperty({
				spec,
				row,
				key: property,
				includeMappings,
				indent,
				context: { featureTypes, nestedBuilders },
			});
			const next = patchFixtureProperty({
				source,
				builder: rowSpec.builder,
				idField: located.idField,
				id: located.id,
				where,
				property,
				text,
			});
			if (next === null) return null;
			source = next;
			if (property === "versionSlug" && versioned) {
				const slug =
					typeof row.versionSlug === "string" ? row.versionSlug : "v1";
				where = [{ field: "versionSlug", equals: slug, absentMeans: "v1" }];
			}
		}
		return source;
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
		const rowSpec = specFor(row);
		const located = locateFixture({
			configPath,
			files,
			builder: rowSpec.builder,
			idField: rowSpec.idField,
			id,
			internalId: internalIdOf(entry),
			where: constraintsFor(entry),
		});
		if (located === null) {
			// A literal built from spreads or calls is there but cannot be edited;
			// only a version the config never had is missing rather than unlocatable.
			const dynamic = locateFixture({
				configPath,
				files,
				builder: rowSpec.builder,
				idField: rowSpec.idField,
				id,
				internalId: internalIdOf(entry),
				where: constraintsFor(entry),
				allowDynamic: true,
			});
			if (versioned && dynamic === null) {
				appendRow({ id, entry });
				return;
			}
			result.unlocated.push({ id, action: "replace with the server's copy" });
			return;
		}
		const key = keyOf({ id, slug: slugOf(entry) });
		// A sibling version rides the preview for context; only its own diff is work.
		if (entry.siblingOf !== undefined && entry.planChange == null) return;
		// The emitter's indent is the found call's own line indent, so the
		// closing `})` lines up with the text it replaces.
		const indent = leadingIndentOfLine(
			located.source,
			located.node.range().start.index,
		);
		// When the preview names the fields, only those move; the rest of the
		// fixture keeps its bytes. A diff without fields rewrites the whole call.
		const patched = patchChangedProperties({
			entry,
			row,
			indent,
			located,
			rowSpec,
		});
		if (patched !== null) {
			files.set(located.file, patched);
			ensureNestedBuilderImports({ file: located.file, row });
			result.replaced.push(key);
			result.lines.push(`~ ${key}`);
			return;
		}
		const text = emitFixture({
			spec,
			row,
			includeMappings,
			indent,
			context: { featureTypes },
		});
		const updated = replaceFixture({
			source: located.source,
			builder: rowSpec.builder,
			idField: located.idField,
			id: located.id,
			where: located.where,
			text,
		});
		if (updated === null) return;
		files.set(located.file, updated);
		ensureNestedBuilderImports({ file: located.file, row });
		result.replaced.push(key);
		result.lines.push(`~ ${key}`);
	};

	// The preview speaks for what the config states. A version the config never
	// mentions is still the server's truth, so versioned rows the config has no
	// fixture for are appended straight from the catalog.
	const appendUnstatedVersions = (): void => {
		if (!versioned) return;
		for (const row of rowsById.values()) {
			const id = idOfRow(row);
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
