import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogRowsToCatalog } from "@autumn/balance-engine";
import {
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { replaceCatalog } from "../../../src/state/repos/catalogRows.js";

const rows = createCatalogRowsFor({ state: createState() });
const features = rows.filter((row) => row.table === "features");

const directories: string[] = [];
const catalogPath = () => {
	const directory = mkdtempSync(join(tmpdir(), "atom-catalog-"));
	directories.push(directory);
	return join(directory, "catalog.sqlite");
};
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("catalog store", () => {
	test("there is no shared catalog until Autumn sends one", () => {
		const catalogStore = openCatalogStore({ databasePath: catalogPath() });

		expect(catalogStore.read()).toBeNull();
		catalogStore.close();
	});

	test("the rows Autumn sent read back as one catalog, with when Autumn read them", () => {
		const catalogStore = openCatalogStore({ databasePath: catalogPath() });

		catalogStore.set({ rows, readAt: 1700 });

		expect(catalogStore.read()).toEqual({
			catalog: catalogRowsToCatalog({ rows }),
			readAt: 1700,
		});
		catalogStore.close();
	});

	test("a set replaces the whole catalog, so a row Autumn no longer sends is gone", () => {
		const catalogStore = openCatalogStore({ databasePath: catalogPath() });
		catalogStore.set({ rows, readAt: 1700 });

		catalogStore.set({ rows: features, readAt: 1800 });

		expect(catalogStore.read()).toEqual({
			catalog: catalogRowsToCatalog({ rows: features }),
			readAt: 1800,
		});
		catalogStore.close();
	});

	test("a catalog read earlier than the one held is ignored: a late push never undoes a newer one", () => {
		const catalogStore = openCatalogStore({ databasePath: catalogPath() });
		catalogStore.set({ rows, readAt: 1800 });

		const stored = catalogStore.set({ rows: features, readAt: 1700 });

		expect(stored).toBe(false);
		expect(catalogStore.read()).toEqual({
			catalog: catalogRowsToCatalog({ rows }),
			readAt: 1800,
		});
		catalogStore.close();
	});

	test("another process's later catalog is seen under the write lock, not from a copy read before it", () => {
		const databasePath = catalogPath();
		const catalogStore = openCatalogStore({ databasePath });
		catalogStore.set({ rows, readAt: 1800 });
		// A second process compares nothing beforehand: the replace itself must refuse the earlier read.
		const otherProcess = { sqliteDb: new Database(databasePath) };

		const stored = replaceCatalog({
			ctx: otherProcess,
			rows: features,
			readAt: 1750,
		});

		expect(stored).toBe(false);
		expect(catalogStore.read()).toEqual({
			catalog: catalogRowsToCatalog({ rows }),
			readAt: 1800,
		});
		otherProcess.sqliteDb.close();
		catalogStore.close();
	});

	test("the catalog and its read time survive a restart", () => {
		const databasePath = catalogPath();
		const before = openCatalogStore({ databasePath });
		before.set({ rows, readAt: 1700 });
		before.close();

		const after = openCatalogStore({ databasePath });

		expect(after.read()).toEqual({
			catalog: catalogRowsToCatalog({ rows }),
			readAt: 1700,
		});
		after.close();
	});

	test("a catalog its owner thread stored is installed without writing the file again", () => {
		const databasePath = catalogPath();
		const owner = openCatalogStore({ databasePath });
		const other = openCatalogStore({ databasePath });
		owner.set({ rows, readAt: 1700 });

		expect(other.install({ rows: features, readAt: 1800 })).toBe(true);
		expect(other.install({ rows, readAt: 1750 })).toBe(false);

		expect(other.read()).toEqual({
			catalog: catalogRowsToCatalog({ rows: features }),
			readAt: 1800,
		});
		// The file still holds what the owner wrote: a reopened store reads that.
		expect(openCatalogStore({ databasePath }).read()?.readAt).toBe(1700);
		owner.close();
		other.close();
	});

	test("a catalog nobody changed is not read from the file again", () => {
		const catalogStore = openCatalogStore({ databasePath: catalogPath() });
		catalogStore.set({ rows, readAt: 1700 });

		// The same object back means the held copy was reused, not rebuilt.
		expect(catalogStore.read()).toBe(catalogStore.read());
		catalogStore.close();
	});
});
