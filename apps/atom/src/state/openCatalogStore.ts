import type { Database } from "bun:sqlite";
import { catalogRowsToCatalog } from "@autumn/balance-engine";
import { openSqliteDatabase } from "./openSqliteDatabase.js";
import { openVersionStamps } from "./openVersionStamps.js";
import {
	readCatalogReadAt,
	readCatalogRows,
	replaceCatalog,
} from "./repos/catalogRows.js";
import type { CatalogStore, SharedCatalog } from "./types/catalogStore.js";

const CATALOG_SCHEMA_VERSION = 2;
const CATALOG_STAMP = "catalog";

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
	// One row at most: when Autumn read the catalog the rows came from.
	database.run(`
		CREATE TABLE IF NOT EXISTS catalog_info (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			read_at INTEGER NOT NULL
		)
	`);
};

/** One catalog file per data folder. The file is the truth; the parsed copy is rebuilt from it on open. */
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
		const readAt = readCatalogReadAt({ ctx });
		if (readAt === null) return null;
		const rows = readCatalogRows({ ctx });
		return { catalog: catalogRowsToCatalog({ rows }), readAt };
	}

	const stamps = openVersionStamps({
		path: databasePath === ":memory:" ? null : `${databasePath}-stamps`,
	});
	// Read before the file, so a write that lands in between moves the stamp past the one held.
	let heldStamp = stamps.read({ key: CATALOG_STAMP });
	let sharedCatalog = readFromFile();

	/** The held copy, read again from the file only when a write has moved the stamp since. */
	function read(): SharedCatalog | null {
		const stamp = stamps.read({ key: CATALOG_STAMP });
		if (stamp !== heldStamp) {
			heldStamp = stamp;
			sharedCatalog = readFromFile();
		}
		return sharedCatalog;
	}

	function set({ rows, readAt }: Parameters<CatalogStore["set"]>[0]): boolean {
		// A push can arrive late, after a retry, or be beaten by another process: the file decides, under its write lock.
		if (!replaceCatalog({ ctx, rows, readAt })) return false;
		stamps.bump({ key: CATALOG_STAMP });
		heldStamp = stamps.read({ key: CATALOG_STAMP });
		sharedCatalog = { catalog: catalogRowsToCatalog({ rows }), readAt };
		return true;
	}

	return {
		read,
		set,
		close: () => ctx.sqliteDb.close(true),
	};
};
