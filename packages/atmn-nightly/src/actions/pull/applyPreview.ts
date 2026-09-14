import { dirname, join } from "node:path";
import {
	branchSpecs,
	type CollectionSpec,
	emitFixture,
	emitFixtureProperty,
	resolveBranch,
} from "../../generated/emitRuntime";
import { appendToBinding } from "../../surgery/appendToBinding";
import { appendToCollection } from "../../surgery/appendToCollection";
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
import { appendPlanVersionFixture } from "./appendPlanVersionFixture";
import { changedFixtureKeys } from "./changedFixtureKeys";
import { type FixtureConstraint, locateFixture } from "./locateFixture";
import {
	collectionTargetReferenceName,
	resolveCollectionTarget,
} from "./resolveCollectionTarget";
import { activeVersionOf, routePlanRow } from "./routePlanRow";

export type PreviewEntry = { action?: string } & Record<string, unknown>;

const DRAFT_FLAG = /\bactive:\s*false\b/;
const snakeOf = (camel: string): string =>
	camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export type ApplyPreviewArgs = {
	collection: string;
	spec: CollectionSpec;
	/** The preview's rows for this collection. */
	entries: PreviewEntry[];
	/** The catalog's server rows for this collection. */
	catalogRows: Record<string, unknown>[];
	/** The executed config's wire rows for this collection: what the code states. */
	statedRows: Record<string, unknown>[];
	configPath: string;
	/** In-memory file sources, mutated in place; nothing touches disk here. */
	files: Map<string, string>;
	includeMappings: boolean;
	featureTypes?: Readonly<Record<string, string>>;
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
	statedRows,
	configPath,
	files,
	includeMappings,
	featureTypes,
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

	// A union item is addressed through its branch: the builder, the id field
	// and the fixture keys are the branch's, not the collection's.
	const specFor = (row: Record<string, unknown>): CollectionSpec =>
		resolveBranch({ spec, row }).spec;
	const bodyOf = (row: Record<string, unknown>): Record<string, unknown> =>
		resolveBranch({ spec, row }).row;
	const idOfRow = (row: Record<string, unknown>): unknown =>
		bodyOf(row)[specFor(row).responseIdField];

	const rowsById = new Map<string, Record<string, unknown>>();
	const rowsByPlan = new Map<string, Record<string, unknown>[]>();
	for (const row of catalogRows) {
		// Archived rows are server history, not something a pull should write.
		if (row.archived === true) continue;
		const id = idOfRow(row);
		if (typeof id !== "string") continue;
		rowsById.set(keyOf({ id, slug: slugOf(row) }), row);
		rowsByPlan.set(id, [...(rowsByPlan.get(id) ?? []), row]);
	}

	// The wire is snake_case; `active` there is membership: plans or history.
	const statedActive = new Map<string, boolean>();
	const wireIdField = snakeOf(spec.idField);
	for (const row of statedRows) {
		const active = row.active !== false;
		if (typeof row.internal_id === "string")
			statedActive.set(row.internal_id, active);
		const id = row[wireIdField];
		if (typeof id !== "string") continue;
		const slug = typeof row.version_slug === "string" ? row.version_slug : "v1";
		statedActive.set(keyOf({ id, slug }), active);
	}
	const configActiveOf = ({
		id,
		entry,
	}: {
		id: string;
		entry: PreviewEntry;
	}): boolean | undefined => {
		const internalId = internalIdOf(entry);
		if (internalId !== null && statedActive.has(internalId))
			return statedActive.get(internalId);
		return statedActive.get(keyOf({ id, slug: slugOf(entry) }));
	};

	const constraintsFor = (
		entry: PreviewEntry,
	): FixtureConstraint[] | undefined =>
		versioned
			? [{ field: "versionSlug", equals: slugOf(entry), absentMeans: "v1" }]
			: undefined;
	const internalIdOf = (entry: PreviewEntry): string | null =>
		typeof entry.internalId === "string" ? entry.internalId : null;
	const historyFileFor = ({
		id,
		row,
	}: {
		id: string;
		row: Record<string, unknown>;
	}): string => {
		const planRows = rowsByPlan.get(id) ?? [];
		const activeVersion = activeVersionOf({
			rows: planRows as { active?: boolean; version?: number }[],
		});
		const nonRootFiles = new Map(
			[...files].filter(([file]) => file !== configPath),
		);
		for (const sibling of planRows) {
			if (sibling === row) continue;
			const route = routePlanRow({
				row: sibling as { active?: boolean; version?: number },
				activeVersion,
			});
			if (route.collection !== "planVersions") continue;
			const siblingId = idOfRow(sibling);
			if (typeof siblingId !== "string") continue;
			const located = locateFixture({
				configPath: "",
				files: nonRootFiles,
				builder: specFor(sibling).builder,
				idField: specFor(sibling).idField,
				id: siblingId,
				internalId:
					typeof sibling.internalId === "string" ? sibling.internalId : null,
				where: [
					{
						field: "versionSlug",
						equals: slugOf(sibling),
						absentMeans: "v1",
					},
				],
			});
			if (located !== null) return located.file;
		}
		return join(dirname(configPath), "planVersions", `${id}.ts`);
	};
	const collectionForRemoval = ({
		name,
		fixtureFile,
	}: {
		name: string;
		fixtureFile: string;
	}): { targetCollection: string; referenceName: string } | null => {
		const collectionTargets = [collection, spec.historyKey].flatMap(
			(targetCollection) => {
				if (targetCollection === undefined) return [];
				const target = resolveCollectionTarget({
					configPath,
					files,
					collection: targetCollection,
				});
				return target === null ? [] : [{ targetCollection, target }];
			},
		);
		const membershipMatches = collectionTargets.flatMap(
			({ targetCollection, target }) => {
				const referenceName = collectionTargetReferenceName({
					target,
					files,
					collection: targetCollection,
					name,
					fixtureFile,
				});
				return referenceName === null
					? []
					: [{ targetCollection, referenceName }];
			},
		);
		if (membershipMatches.length === 1) return membershipMatches[0];
		const locationMatches = collectionTargets.filter(
			({ target }) => target.file === fixtureFile,
		);
		if (locationMatches.length === 1)
			return { ...locationMatches[0], referenceName: name };
		return null;
	};
	const deleteExportReference = ({
		name,
		targetCollection,
	}: {
		name: string;
		targetCollection: string;
	}): void => {
		const target = resolveCollectionTarget({
			configPath,
			files,
			collection: targetCollection,
		});
		if (target === null) return;
		files.set(
			target.file,
			deleteReference({ source: files.get(target.file) ?? "", name }),
		);
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
		const ownership =
			removed.exportedName === undefined
				? null
				: collectionForRemoval({
						name: removed.exportedName,
						fixtureFile: located.file,
					});
		if (removed.exportedName !== undefined && ownership === null) {
			result.unlocated.push({
				id,
				action:
					"remove its exported reference by hand: collection ownership is ambiguous",
			});
			return;
		}
		files.set(located.file, removed.source);
		if (ownership !== null)
			deleteExportReference({
				name: ownership.referenceName,
				targetCollection: ownership.targetCollection,
			});
		result.deleted.push(id);
		result.lines.push(`- ${id}`);
	};

	const appendRow = ({
		id,
		entry,
		placement,
	}: {
		id: string;
		entry: PreviewEntry;
		/** Known membership beats the numeric route: where a moved row goes. */
		placement?: "plans" | "history";
	}): boolean => {
		const key = keyOf({ id, slug: slugOf(entry) });
		const row = rowsById.get(key);
		if (row === undefined) return false;
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
		let target = collection;
		let emitted: Record<string, unknown> = row;
		if (versioned) {
			const route =
				placement !== undefined
					? { collection: placement, draft: false }
					: routePlanRow({
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
		// A config that never mentioned the collection gets the key, then the row.
		// Unless the object spreads another one: the key may live there, and a
		// second `features:` after the spread would silently override it.
		const configSource = files.get(configPath) ?? "";
		const withKey = insertCollection({
			source: configSource,
			collection: target,
		});
		if (withKey === null) return false;
		const spreads = rootSpreadNames({ source: configSource });
		if (withKey !== configSource && spreads.length > 0) {
			result.unlocated.push({
				id: key,
				action: `append to \`${target}\` by hand: atmn() spreads \`${spreads.join("`, `")}\`, which may already hold it`,
			});
			return false;
		}
		files.set(configPath, withKey);
		// The array may be a const the config names, in this file or an imported one.
		const resolved = resolveCollectionTarget({
			configPath,
			files,
			collection: target,
		});
		if (resolved === null) {
			result.unlocated.push({
				id: key,
				action: `append to \`${target}\` by hand: it is not an array literal`,
			});
			return false;
		}
		// The surgery indents the first line; the emitter indents the rest.
		if (versioned && target === spec.historyKey) {
			const versionSlug = slugOf(row);
			const appended = appendPlanVersionFixture({
				configPath,
				files,
				target: resolved,
				fixtureFile: historyFileFor({ id, row }),
				planId: id,
				versionSlug,
				fixture: emitFixture({
					spec,
					row: emitted,
					includeMappings,
					indent: "",
				}),
				builder: rowSpec.builder,
				targetCollection: target,
				builderCollection: collection,
			});
			if (!appended) {
				result.unlocated.push({
					id: key,
					action: `append to \`${target}\` by hand: it is not an array literal`,
				});
				return false;
			}
			result.appended.push(key);
			result.lines.push(`+ ${key}`);
			return true;
		}
		const text = (elementIndent: string) =>
			emitFixture({
				spec,
				row: emitted,
				includeMappings,
				indent: elementIndent,
				context: { featureTypes },
			});
		const targetSource = files.get(resolved.file) ?? "";
		const updated =
			resolved.kind === "inline"
				? appendToCollection({ source: targetSource, collection: target, text })
				: appendToBinding({ source: targetSource, name: resolved.name, text });
		if (updated === null) {
			result.unlocated.push({
				id: key,
				action: `append to \`${target}\` by hand: it is not an array literal`,
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
				context: { featureTypes },
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
		let emitted: Record<string, unknown> = row;
		if (versioned) {
			// Membership is state, and the config's own statement is the truth
			// about where a row sits: version numbers are creation order on the
			// server, so history pushed later is numbered higher, not newer.
			const serverActive = row.active === true;
			const configActive = configActiveOf({ id, entry });
			const moves = configActive !== undefined && configActive !== serverActive;
			// A sibling version only matters when its state changed.
			if (entry.siblingOf !== undefined && !moves) return;
			if (moves) {
				const removed = deleteFixtureLiteral({
					source: located.source,
					builder: rowSpec.builder,
					idField: located.idField,
					id: located.id,
					where: located.where,
				});
				if (removed === null) return;
				const ownership =
					removed.exportedName === undefined
						? null
						: collectionForRemoval({
								name: removed.exportedName,
								fixtureFile: located.file,
							});
				if (removed.exportedName !== undefined && ownership === null) {
					result.unlocated.push({
						id,
						action:
							"move its exported reference by hand: collection ownership is ambiguous",
					});
					return;
				}
				files.set(located.file, removed.source);
				if (ownership !== null)
					deleteExportReference({
						name: ownership.referenceName,
						targetCollection: ownership.targetCollection,
					});
				const appended = appendRow({
					id,
					entry,
					placement: serverActive ? "plans" : "history",
				});
				if (!appended) return;
				result.appended.pop();
				result.lines.pop();
				result.replaced.push(key);
				result.lines.push(`~ ${key}`);
				return;
			}
			// Rewritten where it is; a draft keeps its spelled-out flag.
			const isDraft = DRAFT_FLAG.test(located.node.text());
			const { active: _stamped, ...bare } = row;
			emitted = isDraft ? { ...bare, active: false } : bare;
		}
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
			row: emitted,
			indent,
			located,
			rowSpec,
		});
		if (patched !== null) {
			files.set(located.file, patched);
			result.replaced.push(key);
			result.lines.push(`~ ${key}`);
			return;
		}
		const text = emitFixture({
			spec,
			row: emitted,
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
