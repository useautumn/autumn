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
});
