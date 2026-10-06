import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
} from "@autumn/balance-engine";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import { atomOrg } from "../utils/atomFixtures.js";

const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const emptyCatalog: StoredSubject["catalog"] = {
	entitlements: {},
	products: {},
	features: {},
	prices: {},
	planLicenses: {},
	freeTrials: {},
};
const subjectAt = ({
	logOffset,
	readAt = 1700,
}: {
	logOffset: bigint;
	readAt?: number;
}): StoredSubject => ({
	state: createSubjectState({ identity }),
	catalog: emptyCatalog,
	org: atomOrg,
	logOffset,
	readAt,
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

	test("a subject read earlier than the one held is ignored: a late push never undoes a newer one", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1800 }),
		});

		const stored = sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 41n, readAt: 1700 }),
		});

		expect(stored).toBe(false);
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(subjectAt({ logOffset: 42n, readAt: 1800 }));
		sqliteStore.close();
	});

	test("a subject read at the same instant or later replaces the one held", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 41n, readAt: 1700 }),
		});

		const sameInstant = sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1700 }),
		});
		const later = sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 43n, readAt: 1701 }),
		});

		expect(sameInstant).toBe(true);
		expect(later).toBe(true);
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
				?.logOffset,
		).toBe(43n);
		sqliteStore.close();
	});

	test("two reads at the same instant are ordered by log offset: the earlier change never replaces the later, a retry still lands", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1700 }),
		});

		const earlierChange = sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 41n, readAt: 1700 }),
		});
		const retry = sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1700 }),
		});

		expect(earlierChange).toBe(false);
		expect(retry).toBe(true);
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
				?.logOffset,
		).toBe(42n);
		sqliteStore.close();
	});

	test("counts the subjects it holds", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		expect(sqliteStore.countSubjects()).toBe(0);
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });

		expect(sqliteStore.countSubjects()).toBe(1);
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

	test("a file from an older Atom is emptied, not read with the wrong columns", () => {
		const databasePath = slotPath();
		const older = new Database(databasePath, { create: true });
		older.run(
			"CREATE TABLE subject_states (customer_id TEXT PRIMARY KEY, state_json TEXT)",
		);
		older.run("INSERT INTO subject_states VALUES ('cus_1', '{}')");
		older.run("PRAGMA user_version = 1");
		older.close();

		const sqliteStore = openSqliteStore({ databasePath });
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 5n }) });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(subjectAt({ logOffset: 5n }));
		sqliteStore.close();
	});

	test("a subject is read from the file once, then served from the copy held", () => {
		const databasePath = slotPath();
		const writer = openSqliteStore({ databasePath });
		writer.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		writer.close();
		const sqliteStore = openSqliteStore({ databasePath });
		const read = () =>
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null });

		const first = read();

		expect(first?.logOffset).toBe(41n);
		// Only the slot's owner writes its file: a row changed behind the store's back is not looked for.
		new Database(databasePath).run(
			"UPDATE subject_states SET log_offset = 3 WHERE customer_id = 'cus_1'",
		);
		expect(read()).toBe(first as StoredSubject);
		sqliteStore.close();
	});

	test("a subject written through the same store is read back at once", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		sqliteStore.readSubject({ customerId: "cus_1", entityId: null });

		sqliteStore.setSubjects({ subjects: [subjectAt({ logOffset: 43n })] });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
				?.logOffset,
		).toBe(43n);
		sqliteStore.close();
	});

	test("the parsed copy checks share cannot be changed by one of them", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		const read = sqliteStore.readSubject({
			customerId: "cus_1",
			entityId: null,
		});

		expect(() => {
			(read as { readAt: number }).readAt = 0;
		}).toThrow(TypeError);
		expect(Object.isFrozen(read?.state.identity)).toBe(true);
		sqliteStore.close();
	});

	test("a push to one customer leaves another customer's parsed copy in place", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		const other: StoredSubject = {
			...subjectAt({ logOffset: 1n }),
			state: createSubjectState({
				identity: { ...identity, customerId: "cus_2" },
			}),
		};
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		const first = sqliteStore.readSubject({
			customerId: "cus_1",
			entityId: null,
		});

		sqliteStore.setSubject({ subject: other });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toBe(first);
		sqliteStore.close();
	});
	test("a write installs the subject it stored; one ignored as older leaves the newer copy held", () => {
		const sqliteStore = openSqliteStore({ databasePath: slotPath() });
		const read = () =>
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null });
		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 2n }) });
		const held = read();

		sqliteStore.setSubject({ subject: subjectAt({ logOffset: 1n }) });

		expect(read()).toBe(held as StoredSubject);
		expect(held?.logOffset).toBe(2n);
		expect(Object.isFrozen(held?.state)).toBe(true);
		sqliteStore.close();
	});

	test("each row holds its own catalog slice and org, and reads back whole after a restart", () => {
		const databasePath = slotPath();
		const catalog = {
			...emptyCatalog,
			features: { messages: { id: "messages" } },
		} as unknown as StoredSubject["catalog"];
		const subjects = ["cus_1", "cus_2"].map(
			(customerId): StoredSubject => ({
				...subjectAt({ logOffset: 1n }),
				state: createSubjectState({ identity: { ...identity, customerId } }),
				catalog,
			}),
		);
		const writer = openSqliteStore({ databasePath });
		writer.setSubjects({ subjects });
		writer.close();

		const reopened = openSqliteStore({ databasePath });

		expect(
			reopened.readSubject({ customerId: "cus_2", entityId: null }),
		).toEqual(subjects[1] as StoredSubject);
		const columns = new Database(databasePath)
			.query("SELECT name FROM pragma_table_info('subject_states')")
			.all() as { name: string }[];
		expect(columns.map(({ name }) => name)).toContain("catalog_json");
		reopened.close();
	});

	test("a file of the shared-text schema (v3) is emptied and its shared texts dropped", () => {
		const databasePath = slotPath();
		const older = new Database(databasePath, { create: true });
		older.run(
			"CREATE TABLE subject_states (customer_id TEXT, catalog_hash TEXT)",
		);
		older.run("CREATE TABLE shared_texts (hash TEXT PRIMARY KEY, text TEXT)");
		older.run("PRAGMA user_version = 3");
		older.close();

		const sqliteStore = openSqliteStore({ databasePath });

		expect(sqliteStore.countSubjects()).toBe(0);
		const tables = new Database(databasePath)
			.query("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all() as { name: string }[];
		expect(tables.map(({ name }) => name)).toEqual(["subject_states"]);
		sqliteStore.close();
	});
});
