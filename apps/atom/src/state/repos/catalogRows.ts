import type { Database } from "bun:sqlite";
import {
	type CatalogRow,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";

type CatalogContext = { sqliteDb: Database };

/** Rows were validated where they entered (the request that stored them), so reading only parses JSON. */
export const readCatalogRows = ({
	ctx,
}: {
	ctx: CatalogContext;
}): CatalogRow[] =>
	ctx.sqliteDb
		.query<{ rowJson: string }, []>(
			"SELECT row_json AS rowJson FROM catalog_rows",
		)
		.all()
		.map(({ rowJson }) => JSON.parse(rowJson));

/** Null until Autumn has sent a catalog. */
export const readCatalogReadAt = ({
	ctx,
}: {
	ctx: CatalogContext;
}): number | null => {
	const row = ctx.sqliteDb
		.query<{ readAt: bigint }, []>("SELECT read_at AS readAt FROM catalog_info")
		.get();
	return row ? Number(row.readAt) : null;
};

/**
 * The rows and their read time change together, so a reader never sees one without the other.
 * False when the file already holds a later read: the compare runs under the write lock, so two
 * processes replacing at once cannot both pass it.
 */
export const replaceCatalog = ({
	ctx,
	rows,
	readAt,
}: {
	ctx: CatalogContext;
	rows: CatalogRow[];
	readAt: number;
}): boolean => {
	const insert = ctx.sqliteDb.query(`
		INSERT OR REPLACE INTO catalog_rows (table_name, id, row_json)
		VALUES ($tableName, $id, $rowJson)
	`);
	const replace = ctx.sqliteDb.transaction((): boolean => {
		const held = readCatalogReadAt({ ctx });
		if (held !== null && readAt < held) return false;
		ctx.sqliteDb.run("DELETE FROM catalog_rows");
		for (const row of rows) {
			const key = catalogRowToCatalogKey({ row });
			insert.run({
				tableName: key.table,
				id: key.id,
				rowJson: JSON.stringify(row),
			});
		}
		ctx.sqliteDb
			.query(
				"INSERT OR REPLACE INTO catalog_info (id, read_at) VALUES (1, $readAt)",
			)
			.run({ readAt });
		return true;
	});
	return replace.immediate();
};
