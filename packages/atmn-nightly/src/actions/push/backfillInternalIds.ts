import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { COLLECTIONS } from "../../generated/emit";
import { insertFirstProperty } from "../../surgery/insertFirstProperty";
import { setFixtureProperty } from "../../surgery/setFixtureProperty";
import { listSourceFiles } from "../pull/listSourceFiles";
import { locateFixture } from "../pull/locateFixture";

export type IdentityRow = {
	id?: string;
	internalId?: string | null;
	versionSlug?: string | null;
};

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

const INTERNAL_ID_VALUE = /\binternalId\s*:\s*"([^"]*)"/;

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
}): { backfilled: string[] } => {
	const files = new Map<string, string>();
	files.set(configPath, readFileSync(configPath, "utf8"));
	for (const file of listSourceFiles({ directory: dirname(configPath) })) {
		if (!files.has(file)) files.set(file, readFileSync(file, "utf8"));
	}
	const originals = new Map(files);
	const backfilled: string[] = [];

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
			});
			// Not a plain literal: the row still matches by public id next push.
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
	}

	for (const [file, source] of files) {
		if (source !== originals.get(file)) writeFileSync(file, source, "utf8");
	}
	return { backfilled };
};
