import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { COLLECTIONS } from "../../generated/emit";
import { insertFirstProperty } from "../../surgery/insertFirstProperty";
import { listSourceFiles } from "../pull/listSourceFiles";
import { locateFixture } from "../pull/locateFixture";

type AppliedRow = { id?: string; internalId?: string | null; action?: string };

const HAS_INTERNAL_ID = /\binternalId\s*:/;

/**
 * After apply, each created row's minted id is written into its fixture, so
 * the next push addresses the row by identity and a changed public id is a
 * rename rather than a delete and a create.
 */
export const backfillInternalIds = ({
	results,
	configPath,
}: {
	results: Record<string, unknown>;
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
		const rows = results[collection];
		if (!Array.isArray(rows)) continue;
		for (const row of rows as AppliedRow[]) {
			if (row.action !== "create") continue;
			if (typeof row.id !== "string" || typeof row.internalId !== "string")
				continue;
			const located = locateFixture({
				configPath,
				files,
				builder: spec.builder,
				idField: spec.idField,
				id: row.id,
			});
			// Not a plain literal: the row still matches by public id next push.
			if (located === null || HAS_INTERNAL_ID.test(located.node.text()))
				continue;
			const updated = insertFirstProperty({
				source: located.source,
				builder: spec.builder,
				idField: spec.idField,
				id: row.id,
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
