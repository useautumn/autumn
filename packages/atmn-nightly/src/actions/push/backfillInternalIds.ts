import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { COLLECTIONS } from "../../generated/emit";
import { insertFirstProperty } from "../../surgery/insertFirstProperty";
import { listSourceFiles } from "../pull/listSourceFiles";
import { locateFixture } from "../pull/locateFixture";

type AppliedRow = {
	id?: string;
	internalId?: string | null;
	action?: string;
	versionSlug?: string | null;
};

const HAS_INTERNAL_ID = /\binternalId\s*:/;

/**
 * After apply, each created row's minted id is written into its fixture, so
 * the next push addresses the row by identity and a changed public id is a
 * rename rather than a delete and a create.
 */
export const backfillInternalIds = ({
	applied,
	configPath,
}: {
	/** The update response: `results` per collection, plus full plan rows. */
	applied: { results?: Record<string, unknown> } & Record<string, unknown>;
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
		// Versioned rows come back in full with their slug; others in `results`.
		const rows = spec.historyKey
			? applied[collection]
			: applied.results?.[collection];
		if (!Array.isArray(rows)) continue;
		for (const row of rows as AppliedRow[]) {
			if (!spec.historyKey && row.action !== "create") continue;
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
			if (located === null || HAS_INTERNAL_ID.test(located.node.text()))
				continue;
			const updated = insertFirstProperty({
				source: located.source,
				builder: spec.builder,
				idField: located.idField,
				id: located.id,
				where: located.where,
				property: `internalId: ${JSON.stringify(row.internalId)}`,
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
