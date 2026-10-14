import type { Database } from "bun:sqlite";
import { catalogRowsToCatalog } from "@autumn/balance-engine";
import { openSqliteDatabase } from "./openSqliteDatabase.js";
import { readCatalogFile, replaceCatalog } from "./repos/catalogRows.js";
import type { CatalogStore, SharedCatalog } from "./types/catalogStore.js";

const CATALOG_SCHEMA_VERSION = 2;

const dropCatalogSchema = ({ database }: { database: Database }) => {
	database.run("DROP TABLE IF EXISTS catalog_rows");
	database.run("DROP TABLE IF EXISTS catalog_info");
};

const createCatalogSchema = ({ database }: { database: Database }) => {
	database.run(`
		CREATE TABLE IF NOT EXISTS catalog_rows (
			table_name TEXT NOT NULL,
			id TEXT NOT NULL,
			row_json TEXT NOT NULL,
			PRIMARY KEY (table_name, id)
		) WITHOUT ROWID
	`);
	database.run(`
		CREATE TABLE IF NOT EXISTS catalog_info (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			read_at INTEGER NOT NULL
		)
	`);
};

export const openCatalogStore = ({
	databasePath,
}: {
	databasePath: string;
}): CatalogStore => {
	const ctx = {
		sqliteDb: openSqliteDatabase({
			databasePath,
			schemaVersion: CATALOG_SCHEMA_VERSION,
			dropSchema: dropCatalogSchema,
			createSchema: createCatalogSchema,
		}),
	};

	function readFromFile(): SharedCatalog | null {
		const held = readCatalogFile({ ctx });
		return held && { catalog: catalogRowsToCatalog(held), readAt: held.readAt };
	}

	let sharedCatalog = readFromFile();

	function install({
		rows,
		readAt,
	}: Parameters<CatalogStore["set"]>[0]): boolean {
		if (sharedCatalog && readAt < sharedCatalog.readAt) return false;
		sharedCatalog = { catalog: catalogRowsToCatalog({ rows }), readAt };
		return true;
	}

	function set(params: Parameters<CatalogStore["set"]>[0]): boolean {
		if (!replaceCatalog({ ctx, ...params })) return false;
		return install(params);
	}

	return {
		read: () => sharedCatalog,
		set,
		install,
		rows: () => readCatalogFile({ ctx }),
		close: () => ctx.sqliteDb.close(true),
	};
};
