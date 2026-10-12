import { describe, expect, test } from "bun:test";
import { type CatalogRow, catalogRowsToCatalog } from "@autumn/balance-engine";
import {
	createCatalogFor,
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { freshestCatalog } from "../../../src/processor/actions/readCurrentSubject/freshestCatalog.js";
import type { SharedCatalog } from "../../../src/state/types/catalogStore.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import { atomOrg } from "../utils/atomFixtures.js";

const state = createState({ balance: 10 });
const customerCatalog = createCatalogFor({ state });

const storedReadAt = ({ readAt }: { readAt: number }): StoredSubject => ({
	state,
	catalog: customerCatalog,
	org: atomOrg,
	logOffset: 1n,
	readAt,
	customerVersion: 0n,
});

/** The customer's entitlement rows as edited since, and nothing else: allowance 777. */
const editedEntitlements: CatalogRow[] = createCatalogRowsFor({ state })
	.filter((row) => row.table === "entitlements")
	.map((row) =>
		row.table === "entitlements"
			? { table: "entitlements", row: { ...row.row, allowance: 777 } }
			: row,
	);
const sharedReadAt = ({ readAt }: { readAt: number }): SharedCatalog => ({
	catalog: catalogRowsToCatalog({ rows: editedEntitlements }),
	readAt,
});

const allowancesOf = (catalog: StoredSubject["catalog"]) =>
	Object.values(catalog.entitlements).map((row) => row.allowance);

describe("the catalog a subject is joined to", () => {
	test("is the customer's own copy until Autumn has sent a shared catalog", () => {
		const stored = storedReadAt({ readAt: 1000 });

		expect(freshestCatalog({ stored, shared: null })).toBe(customerCatalog);
	});

	test("is the customer's own copy when the customer was read after the shared catalog", () => {
		const stored = storedReadAt({ readAt: 2000 });

		const catalog = freshestCatalog({
			stored,
			shared: sharedReadAt({ readAt: 1000 }),
		});

		expect(catalog).toBe(customerCatalog);
	});

	test("takes the shared row when the shared catalog was read after the customer", () => {
		const stored = storedReadAt({ readAt: 1000 });

		const catalog = freshestCatalog({
			stored,
			shared: sharedReadAt({ readAt: 2000 }),
		});

		expect(allowancesOf(catalog)).toEqual([777]);
	});

	test("keeps the customer's own row where the newer shared catalog has none", () => {
		const stored = storedReadAt({ readAt: 1000 });

		const catalog = freshestCatalog({
			stored,
			shared: sharedReadAt({ readAt: 2000 }),
		});

		expect(catalog.features).toEqual(customerCatalog.features);
		expect(catalog.products).toEqual(customerCatalog.products);
	});

	test("takes the shared row when both were read at the same instant", () => {
		const stored = storedReadAt({ readAt: 1000 });

		const catalog = freshestCatalog({
			stored,
			shared: sharedReadAt({ readAt: 1000 }),
		});

		expect(allowancesOf(catalog)).toEqual([777]);
	});
});
