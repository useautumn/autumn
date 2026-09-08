import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SgNode } from "@ast-grep/napi";
import { COLLECTIONS, NESTED_FIXTURES } from "../../generated/emit";
import { branchSpecs, resolveBranch } from "../../generated/emitRuntime";
import type { FixtureShape } from "../../surgery/findFixture";
import { insertFirstProperty } from "../../surgery/insertFirstProperty";
import {
	fixturePropertyString,
	fixtureStatesProperty,
	patchFixtureProperty,
} from "../../surgery/patchFixtureProperty";
import { setFixtureProperty } from "../../surgery/setFixtureProperty";
import { listSourceFiles } from "../pull/listSourceFiles";
import {
	type FixtureConstraint,
	type LocatedFixture,
	locateFixture,
} from "../pull/locateFixture";

export type IdentityRow = {
	id?: string;
	internalId?: string | null;
	versionSlug?: string | null;
	/** A plan's variant edges as `get` returns them: the resolved plan carries the stable id. */
	variants?: VariantEdge[];
};

type VariantEdge = {
	variantPlanId?: string;
	versionSlug?: string | null;
	internalId?: string | null;
	plan?: { internalId?: string | null; versionSlug?: string | null } | null;
};

/** The edge states the identity only on a bare link; otherwise the resolved
 * plan carries it. */
const variantInternalId = (edge: VariantEdge): string | null | undefined =>
	edge.internalId ?? edge.plan?.internalId;

const variantVersionSlug = (edge: VariantEdge): string | null | undefined =>
	edge.versionSlug ?? edge.plan?.versionSlug;

/** Push: created features from `results`, every direct plan row in full. */
export const identityRowsFromApplied = ({
	applied,
}: {
	applied: { results?: Record<string, unknown> } & Record<string, unknown>;
}): Record<string, IdentityRow[]> =>
	Object.fromEntries(
		Object.entries(COLLECTIONS).map(([collection, spec]) => {
			const rows = spec.historyKey
				? applied[collection]
				: (
						applied.results?.[collection] as { action?: string }[] | undefined
					)?.filter((row) => row.action === "create");
			return [collection, Array.isArray(rows) ? (rows as IdentityRow[]) : []];
		}),
	);

/** Pull: every row the catalog returned. */
export const identityRowsFromCatalog = ({
	catalog,
}: {
	catalog: Record<string, unknown>;
}): Record<string, IdentityRow[]> =>
	Object.fromEntries(
		Object.keys(COLLECTIONS).map((collection) => {
			const rows = catalog[collection];
			if (!Array.isArray(rows)) return [collection, []];
			// A union row carries its identity inside its branch.
			const spec = COLLECTIONS[collection];
			return [
				collection,
				rows.map((row) =>
					spec === undefined
						? row
						: resolveBranch({
								spec,
								row: row as Record<string, unknown>,
							}).row,
				) as IdentityRow[],
			];
		}),
	);

/** A property the fixture already states: its literal, or the fact that it is
 * an expression this rewriter must not double up on. */
type StatedProperty =
	| { kind: "absent" }
	| { kind: "dynamic" }
	| { kind: "literal"; value: string };

const statedProperty = ({
	call,
	property,
}: {
	call: SgNode;
	property: string;
}): StatedProperty => {
	if (!fixtureStatesProperty({ call, property })) return { kind: "absent" };
	const value = fixturePropertyString({ call, property });
	return value === null ? { kind: "dynamic" } : { kind: "literal", value };
};

/**
 * Every row's stable id is written into its fixture when the fixture lacks one,
 * so the next push addresses the row by identity and a changed public id is a
 * rename rather than a delete and a create. Push feeds it the applied rows,
 * pull the whole catalog.
 */
export const backfillInternalIds = ({
	rows,
	configPath,
}: {
	rows: Record<string, IdentityRow[]>;
	configPath: string;
}): { backfilled: string[]; slugged: string[] } => {
	const files = new Map<string, string>();
	files.set(configPath, readFileSync(configPath, "utf8"));
	for (const file of listSourceFiles({ directory: dirname(configPath) })) {
		if (!files.has(file)) files.set(file, readFileSync(file, "utf8"));
	}
	const originals = new Map(files);
	const backfilled: string[] = [];
	const slugged: string[] = [];

	for (const [collection, spec] of Object.entries(COLLECTIONS)) {
		const collectionRows = rows[collection] ?? [];
		for (const row of collectionRows) {
			if (typeof row.id !== "string" || typeof row.internalId !== "string")
				continue;
			// A union row could be written with any of the branch builders.
			let rowSpec = spec;
			let located: ReturnType<typeof locateFixture> = null;
			for (const candidate of branchSpecs({ spec })) {
				located = locateFixture({
					configPath,
					files,
					builder: candidate.builder,
					idField: candidate.idField,
					id: row.id,
					where: candidate.historyKey
						? [
								{
									field: "versionSlug",
									equals: row.versionSlug ?? "v1",
									absentMeans: "v1",
								},
							]
						: undefined,
					allowDynamic: true,
				});
				if (located !== null) {
					rowSpec = candidate;
					break;
				}
			}
			// No literal to write into: the row still matches by public id next push.
			if (located === null) continue;
			const stated = statedProperty({
				call: located.node,
				property: "internalId",
			});
			// An expression the fixture computes would override an inserted pair.
			if (stated.kind === "dynamic") continue;
			if (stated.kind === "literal" && stated.value === row.internalId)
				continue;
			// A stated id the server did not know was ignored and the row minted
			// fresh, so the fixture takes the real id in place of the guess.
			const updated =
				stated.kind === "absent"
					? insertFirstProperty({
							source: located.source,
							builder: rowSpec.builder,
							idField: located.idField,
							id: located.id,
							where: located.where,
							property: `internalId: ${JSON.stringify(row.internalId)}`,
						})
					: setFixtureProperty({
							source: located.source,
							builder: rowSpec.builder,
							idField: located.idField,
							id: located.id,
							where: located.where,
							property: "internalId",
							value: row.internalId,
						});
			if (updated === null) continue;
			files.set(located.file, updated);
			backfilled.push(row.id);
		}
		// The slug travels with the id: a fixture that never stated one takes the
		// server's, so a nuke-and-repush or a sandbox-to-prod push keeps its names.
		if (spec.historyKey) {
			for (const row of collectionRows) {
				if (
					typeof row.internalId !== "string" ||
					typeof row.versionSlug !== "string"
				)
					continue;
				const located = locateFixture({
					configPath,
					files,
					builder: spec.builder,
					idField: spec.idField,
					id: typeof row.id === "string" ? row.id : "",
					internalId: row.internalId,
					allowDynamic: true,
				});
				if (located === null) continue;
				// A slug the fixture already states, literal or computed, is its own.
				if (
					fixtureStatesProperty({
						call: located.node,
						property: "versionSlug",
					})
				)
					continue;
				const updated = patchFixtureProperty({
					source: located.source,
					builder: spec.builder,
					idField: located.idField,
					id: located.id,
					where: located.where,
					property: "versionSlug",
					text: JSON.stringify(row.versionSlug),
				});
				if (updated === null) continue;
				files.set(located.file, updated);
				if (typeof row.id === "string") slugged.push(row.id);
			}
		}
	}

	// A variant is a `variant({...})` fixture of its own, or an object literal
	// inline under its base plan's `variants`; either takes its id and slug.
	const variantSpec = NESTED_FIXTURES.variants;
	const variantShapes: FixtureShape[] = [
		variantSpec.builder,
		{
			parentBuilder: COLLECTIONS[variantSpec.parent]?.builder ?? "plan",
			arrayProperty: variantSpec.path,
		},
	];
	const locateVariant = ({
		variantPlanId,
		internalId,
		where,
	}: {
		variantPlanId: string;
		internalId?: string;
		where?: FixtureConstraint[];
	}): LocatedFixture | null =>
		locateFixture({
			configPath,
			files,
			builder: variantShapes,
			idField: variantSpec.idField,
			id: variantPlanId,
			internalId,
			where,
			allowDynamic: true,
		});
	for (const row of rows.plans ?? []) {
		for (const edge of row.variants ?? []) {
			const internalId = variantInternalId(edge);
			const versionSlug = variantVersionSlug(edge);
			if (
				typeof edge.variantPlanId !== "string" ||
				typeof internalId !== "string"
			)
				continue;
			const located = locateVariant({
				variantPlanId: edge.variantPlanId,
				// Versions of one variant share the id; the slug tells them apart
				// whenever the catalog states one.
				...(typeof versionSlug === "string"
					? {
							where: [
								{
									field: "versionSlug",
									equals: versionSlug,
									absentMeans: "v1",
								},
							],
						}
					: {}),
			});
			if (located === null) continue;
			const stated = statedProperty({
				call: located.node,
				property: "internalId",
			});
			if (stated.kind === "dynamic") continue;
			if (stated.kind === "literal" && stated.value === internalId) continue;
			const updated =
				stated.kind === "absent"
					? insertFirstProperty({
							source: located.source,
							builder: located.builder,
							idField: located.idField,
							id: located.id,
							where: located.where,
							property: `internalId: ${JSON.stringify(internalId)}`,
						})
					: setFixtureProperty({
							source: located.source,
							builder: located.builder,
							idField: located.idField,
							id: located.id,
							where: located.where,
							property: "internalId",
							value: internalId,
						});
			if (updated === null) continue;
			files.set(located.file, updated);
			backfilled.push(edge.variantPlanId);
		}
	}
	for (const row of rows.plans ?? []) {
		for (const edge of row.variants ?? []) {
			const internalId = variantInternalId(edge);
			const versionSlug = variantVersionSlug(edge);
			if (
				typeof edge.variantPlanId !== "string" ||
				typeof internalId !== "string" ||
				typeof versionSlug !== "string"
			)
				continue;
			const located = locateVariant({
				variantPlanId: edge.variantPlanId,
				internalId,
			});
			if (located === null) continue;
			if (
				fixtureStatesProperty({
					call: located.node,
					property: "versionSlug",
				})
			)
				continue;
			const updated = patchFixtureProperty({
				source: located.source,
				builder: located.builder,
				idField: located.idField,
				id: located.id,
				where: located.where,
				property: "versionSlug",
				text: JSON.stringify(versionSlug),
			});
			if (updated === null) continue;
			files.set(located.file, updated);
			slugged.push(edge.variantPlanId);
		}
	}

	for (const [file, source] of files) {
		if (source !== originals.get(file)) writeFileSync(file, source, "utf8");
	}
	return { backfilled, slugged };
};
