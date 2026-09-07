import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { COLLECTIONS, NESTED_FIXTURES } from "../../generated/emit";
import { insertFirstProperty } from "../../surgery/insertFirstProperty";
import {
	fixturePropertyString,
	patchFixtureProperty,
} from "../../surgery/patchFixtureProperty";
import { setFixtureProperty } from "../../surgery/setFixtureProperty";
import { listSourceFiles } from "../pull/listSourceFiles";
import { locateFixture } from "../pull/locateFixture";

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
			return [collection, Array.isArray(rows) ? (rows as IdentityRow[]) : []];
		}),
	);

const INTERNAL_ID_VALUE = /\binternalId\s*:\s*["']([^"']*)["']/;

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
			const located = locateFixture({
				configPath,
				files,
				builder: spec.builder,
				idField: spec.idField,
				id: row.id,
				where: spec.historyKey
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
			// No literal to write into: the row still matches by public id next push.
			if (located === null) continue;
			const stated = INTERNAL_ID_VALUE.exec(located.node.text())?.[1];
			if (stated === row.internalId) continue;
			// A stated id the server did not know was ignored and the row minted
			// fresh, so the fixture takes the real id in place of the guess.
			const updated =
				stated === undefined
					? insertFirstProperty({
							source: located.source,
							builder: spec.builder,
							idField: located.idField,
							id: located.id,
							where: located.where,
							property: `internalId: ${JSON.stringify(row.internalId)}`,
						})
					: setFixtureProperty({
							source: located.source,
							builder: spec.builder,
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
				if (
					fixturePropertyString({
						call: located.node,
						property: "versionSlug",
					}) !== null
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

	// A variant written as its own `variant({...})` fixture takes its id too;
	// an inline object under the plan is left as the plan's own text.
	const variantSpec = NESTED_FIXTURES.variants;
	for (const row of rows.plans ?? []) {
		for (const edge of row.variants ?? []) {
			const internalId = variantInternalId(edge);
			const versionSlug = variantVersionSlug(edge);
			if (
				typeof edge.variantPlanId !== "string" ||
				typeof internalId !== "string"
			)
				continue;
			const located = locateFixture({
				configPath,
				files,
				builder: variantSpec.builder,
				idField: variantSpec.idField,
				id: edge.variantPlanId,
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
				allowDynamic: true,
			});
			if (located === null) continue;
			const stated = INTERNAL_ID_VALUE.exec(located.node.text())?.[1];
			if (stated === internalId) continue;
			const updated =
				stated === undefined
					? insertFirstProperty({
							source: located.source,
							builder: variantSpec.builder,
							idField: located.idField,
							id: located.id,
							where: located.where,
							property: `internalId: ${JSON.stringify(internalId)}`,
						})
					: setFixtureProperty({
							source: located.source,
							builder: variantSpec.builder,
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
			const located = locateFixture({
				configPath,
				files,
				builder: variantSpec.builder,
				idField: variantSpec.idField,
				id: edge.variantPlanId,
				internalId,
				allowDynamic: true,
			});
			if (located === null) continue;
			if (
				fixturePropertyString({
					call: located.node,
					property: "versionSlug",
				}) !== null
			)
				continue;
			const updated = patchFixtureProperty({
				source: located.source,
				builder: variantSpec.builder,
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
