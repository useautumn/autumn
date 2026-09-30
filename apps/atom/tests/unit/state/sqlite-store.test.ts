import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CommandOrg,
	createSubjectState,
	type MeteringIdentity,
} from "@autumn/balance-engine";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";

const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const org: CommandOrg = {
	config: {
		reverse_deduction_order: false,
		block_overdue_entitlements: false,
		include_past_due: true,
	},
};
const emptyCatalog: StoredSubject["catalog"] = {
	entitlements: {},
	products: {},
	features: {},
	prices: {},
	planLicenses: {},
	freeTrials: {},
};
const subjectAt = ({ logOffset }: { logOffset: bigint }): StoredSubject => ({
	state: createSubjectState({ identity }),
	catalog: emptyCatalog,
	org,
	logOffset,
});

const directories: string[] = [];
const slotPath = () => {
	const directory = mkdtempSync(join(tmpdir(), "atom-slot-"));
	directories.push(directory);
	return join(directory, "slot-000.sqlite");
};
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("sqlite store", () => {
	test("a stored subject reads back as it was sent", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		const subject = subjectAt({ logOffset: 41n });

		sqliteStore.setSubject({ subject });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(subject);
		sqliteStore.close();
	});

	test("a customer never stored reads as null", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });

		expect(
			sqliteStore.readSubject({ customerId: "cus_2", entityId: null }),
		).toBeNull();
		sqliteStore.close();
	});

	test("storing a subject again replaces it", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });

		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 42n }) });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
				?.logOffset,
		).toBe(42n);
		sqliteStore.close();
	});

	test("the file keeps its subjects across a restart", () => {
		const databasePath = slotPath();
		const first = openSqliteStore({ databasePath });
		first.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		first.close();

		const reopened = openSqliteStore({ databasePath });

		expect(
			reopened.readSubject({ customerId: "cus_1", entityId: null })?.logOffset,
		).toBe(41n);
		reopened.close();
	});
});
