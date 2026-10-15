import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
} from "@autumn/balance-engine";
import { openSlotDatabase } from "../../../src/state/openSlotDatabase.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	startWalCheckpointer,
	TICKS_PER_FILE,
} from "../../../src/state/startWalCheckpointer.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import { atomOrg, freshHeld } from "../utils/atomFixtures.js";

const quietLogger = { warn: () => {} };

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
	customerVersion = 0n,
	entityId = null,
}: {
	logOffset: bigint;
	readAt?: number;
	customerVersion?: bigint;
	entityId?: string | null;
}): StoredSubject => ({
	state: createSubjectState({ identity: { ...identity, entityId } }),
	catalog: emptyCatalog,
	org: atomOrg,
	logOffset,
	readAt,
	customerVersion,
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
	test("a stored subject reads back as it was sent", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		const subject = subjectAt({ logOffset: 41n });

		await sqliteStore.setSubject({ subject });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(subject);
		sqliteStore.close();
	});

	test("a customer never stored reads as null", () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});

		expect(
			sqliteStore.readSubject({ customerId: "cus_2", entityId: null }),
		).toBeNull();
		sqliteStore.close();
	});

	test("storing a subject again replaces it", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });

		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 42n }) });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
				?.logOffset,
		).toBe(42n);
		sqliteStore.close();
	});

	test("a subject read earlier than the one held is ignored: a late push never undoes a newer one", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1800 }),
		});

		const stored = await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 41n, readAt: 1700 }),
		});

		expect(stored).toBe(false);
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(subjectAt({ logOffset: 42n, readAt: 1800 }));
		sqliteStore.close();
	});

	test("a subject read at the same instant or later replaces the one held", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 41n, readAt: 1700 }),
		});

		const sameInstant = await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1700 }),
		});
		const later = await sqliteStore.setSubject({
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

	test("two reads at the same instant are ordered by log offset: the earlier change never replaces the later, a retry still lands", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 42n, readAt: 1700 }),
		});

		const earlierChange = await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 41n, readAt: 1700 }),
		});
		const retry = await sqliteStore.setSubject({
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

	test("counts the subjects it holds", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		expect(sqliteStore.countSubjects()).toBe(0);
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });

		expect(sqliteStore.countSubjects()).toBe(1);
		sqliteStore.close();
	});

	test("lists the subjects written at or after a point, oldest write first and keyed within a write, and knows its newest write", async () => {
		let now = 1_700;
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
			now: () => now,
		});
		expect(sqliteStore.maxAppliedAt()).toBe(0);
		for (const [i, customerId] of ["cus_a", "cus_b", "cus_c"].entries()) {
			now = 1_700 + Math.min(i, 1);
			await sqliteStore.setSubject({
				subject: {
					...subjectAt({ logOffset: 1n }),
					state: createSubjectState({ identity: { ...identity, customerId } }),
				},
			});
		}

		const since = sqliteStore.listAppliedAfter({
			after: 1_701,
			cursor: null,
			limit: 10,
		});
		const firstPage = sqliteStore.listAppliedAfter({
			after: null,
			cursor: null,
			limit: 2,
		});
		const last = firstPage.at(-1);
		const nextPage = sqliteStore.listAppliedAfter({
			after: null,
			cursor: last
				? {
						appliedAt: last.appliedAt,
						customerId: last.subject.state.identity.customerId,
						entityId: "",
					}
				: null,
			limit: 2,
		});

		expect(sqliteStore.maxAppliedAt()).toBe(1_701);
		expect(
			since.map(({ subject, appliedAt }) => [
				subject.state.identity.customerId,
				appliedAt,
			]),
		).toEqual([
			["cus_b", 1_701],
			["cus_c", 1_701],
		]);
		// Two rows written in the same ms straddle the page edge; the cursor's key carries the second one over.
		expect(
			firstPage.map(({ subject }) => subject.state.identity.customerId),
		).toEqual(["cus_a", "cus_b"]);
		expect(
			nextPage.map(({ subject }) => subject.state.identity.customerId),
		).toEqual(["cus_c"]);
		sqliteStore.close();
	});

	test("the file keeps its subjects across a restart", async () => {
		const databasePath = slotPath();
		const first = openSqliteStore({ databasePath, held: freshHeld() });
		await first.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		first.close();

		const reopened = openSqliteStore({ databasePath, held: freshHeld() });

		expect(
			reopened.readSubject({ customerId: "cus_1", entityId: null })?.logOffset,
		).toBe(41n);
		reopened.close();
	});

	test("a file from an older Atom is emptied, not read with the wrong columns", async () => {
		const databasePath = slotPath();
		const older = new Database(databasePath, { create: true });
		older.run(
			"CREATE TABLE subject_states (customer_id TEXT PRIMARY KEY, state_json TEXT)",
		);
		older.run("INSERT INTO subject_states VALUES ('cus_1', '{}')");
		older.run("PRAGMA user_version = 1");
		older.close();

		const sqliteStore = openSqliteStore({ databasePath, held: freshHeld() });
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 5n }) });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(subjectAt({ logOffset: 5n }));
		sqliteStore.close();
	});

	test("a subject is read from the file once, then served from the copy held", async () => {
		const databasePath = slotPath();
		const writer = openSqliteStore({ databasePath, held: freshHeld() });
		await writer.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		writer.close();
		const sqliteStore = openSqliteStore({ databasePath, held: freshHeld() });
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

	test("a subject written through the same store is read back at once", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		sqliteStore.readSubject({ customerId: "cus_1", entityId: null });

		await sqliteStore.setSubjects({
			subjects: [subjectAt({ logOffset: 43n })],
		});

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
				?.logOffset,
		).toBe(43n);
		sqliteStore.close();
	});

	test("a push to one customer leaves another customer's parsed copy in place", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		const other: StoredSubject = {
			...subjectAt({ logOffset: 1n }),
			state: createSubjectState({
				identity: { ...identity, customerId: "cus_2" },
			}),
		};
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 41n }) });
		const first = sqliteStore.readSubject({
			customerId: "cus_1",
			entityId: null,
		});

		await sqliteStore.setSubject({ subject: other });

		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toBe(first);
		sqliteStore.close();
	});
	test("a write installs the subject it stored; one ignored as older leaves the newer copy held", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		const read = () =>
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null });
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 2n }) });
		const held = read();

		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 1n }) });

		expect(read()).toBe(held as StoredSubject);
		expect(held?.logOffset).toBe(2n);
		sqliteStore.close();
	});

	test("each row holds its own catalog slice and org, and reads back whole after a restart", async () => {
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
		const writer = openSqliteStore({ databasePath, held: freshHeld() });
		await writer.setSubjects({ subjects });
		writer.close();

		const reopened = openSqliteStore({ databasePath, held: freshHeld() });

		expect(
			reopened.readSubject({ customerId: "cus_2", entityId: null }),
		).toEqual(subjects[1] as StoredSubject);
		const slices = new Database(databasePath)
			.query("SELECT customer_id AS customerId FROM subject_slices")
			.all() as { customerId: string }[];
		expect(slices.map(({ customerId }) => customerId)).toEqual([
			"cus_1",
			"cus_2",
		]);
		reopened.close();
	});

	test("a file from a newer Atom is emptied, so rolling back to an older Atom keeps accepting pushes", async () => {
		const databasePath = slotPath();

		const newer = new Database(databasePath, { create: true });
		newer.run(
			"CREATE TABLE subject_states (customer_id TEXT PRIMARY KEY, state_json TEXT)",
		);
		newer.run("INSERT INTO subject_states VALUES ('cus_1', '{}')");
		newer.run("PRAGMA user_version = 99");
		newer.close();

		const sqliteStore = openSqliteStore({ databasePath, held: freshHeld() });
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 5n }) });

		expect(sqliteStore.countSubjects()).toBe(1);
		sqliteStore.close();
	});

	test("a push whose slice is unchanged reuses the held catalog and org, and rewrites only the state", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		const read = () =>
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null });
		// Each push parses its own copy, equal to the last.
		const pushAt = (logOffset: bigint): StoredSubject => ({
			...structuredClone(subjectAt({ logOffset })),
			logOffset,
		});
		await sqliteStore.setSubject({ subject: pushAt(1n) });
		const first = read();

		await sqliteStore.setSubject({ subject: pushAt(2n) });

		const second = read();
		expect(second?.logOffset).toBe(2n);
		expect(second?.state).not.toBe(first?.state as StoredSubject["state"]);
		expect(second?.catalog).toBe(first?.catalog as StoredSubject["catalog"]);
		expect(second?.org).toBe(first?.org as StoredSubject["org"]);
		sqliteStore.close();
	});

	test("customers on the same catalog slice share one held copy of it, whether pushed or read from the file", async () => {
		const databasePath = slotPath();
		const asCustomer = (customerId: string): StoredSubject => {
			const subject = structuredClone(subjectAt({ logOffset: 1n }));
			return {
				...subject,
				state: { ...subject.state, identity: { ...identity, customerId } },
			};
		};
		const pushed = openSqliteStore({ databasePath, held: freshHeld() });
		for (const customerId of ["cus_1", "cus_2"])
			await pushed.setSubject({ subject: asCustomer(customerId) });
		const read = (store: typeof pushed, customerId: string) =>
			store.readSubject({ customerId, entityId: null });

		expect(read(pushed, "cus_2")?.catalog).toBe(
			read(pushed, "cus_1")?.catalog as StoredSubject["catalog"],
		);
		expect(read(pushed, "cus_2")?.org).toBe(
			read(pushed, "cus_1")?.org as StoredSubject["org"],
		);
		pushed.close();

		const reopened = openSqliteStore({ databasePath, held: freshHeld() });
		expect(read(reopened, "cus_2")?.catalog).toBe(
			read(reopened, "cus_1")?.catalog as StoredSubject["catalog"],
		);
		reopened.close();
	});

	test("the shared slice outlives a collection while a held subject still holds it", async () => {
		const asCustomer = (customerId: string): StoredSubject => {
			const subject = structuredClone(subjectAt({ logOffset: 1n }));
			return {
				...subject,
				state: { ...subject.state, identity: { ...identity, customerId } },
			};
		};
		const store = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await store.setSubject({ subject: asCustomer("cus_1") });
		Bun.gc(true);
		await store.setSubject({ subject: asCustomer("cus_2") });
		const read = (customerId: string) =>
			store.readSubject({ customerId, entityId: null });

		expect(read("cus_2")?.catalog).toBe(
			read("cus_1")?.catalog as StoredSubject["catalog"],
		);
		expect(read("cus_2")?.org).toBe(read("cus_1")?.org as StoredSubject["org"]);
		store.close();
	});

	test("a push whose slice changed rewrites it, and reads back with the new slice after a restart", async () => {
		const databasePath = slotPath();
		const writer = openSqliteStore({ databasePath, held: freshHeld() });
		await writer.setSubject({ subject: subjectAt({ logOffset: 1n }) });
		const changed: StoredSubject = {
			...subjectAt({ logOffset: 2n }),
			catalog: {
				...emptyCatalog,
				features: { messages: { id: "messages" } },
			} as unknown as StoredSubject["catalog"],
		};

		await writer.setSubject({ subject: changed });
		const held = writer.readSubject({ customerId: "cus_1", entityId: null });
		writer.close();
		const reopened = openSqliteStore({ databasePath, held: freshHeld() });

		expect(held?.catalog).toEqual(changed.catalog);
		expect(
			reopened.readSubject({ customerId: "cus_1", entityId: null }),
		).toEqual(changed);
		reopened.close();
	});

	test("a file of an earlier schema number is emptied", () => {
		const databasePath = slotPath();
		const older = new Database(databasePath, { create: true });
		older.run(
			"CREATE TABLE subject_states (customer_id TEXT, entity_id TEXT, state_json TEXT, catalog_json TEXT, org_json TEXT)",
		);
		older.run(
			"INSERT INTO subject_states VALUES ('cus_1', '', '{}', '{}', '{}')",
		);
		older.run("PRAGMA user_version = 5");
		older.close();

		const sqliteStore = openSqliteStore({ databasePath, held: freshHeld() });

		expect(sqliteStore.countSubjects()).toBe(0);
		sqliteStore.close();
	});
});

describe("a customer's version", () => {
	const customerVersionOf = (sqliteStore: ReturnType<typeof openSqliteStore>) =>
		sqliteStore.readSubject({ customerId: "cus_1", entityId: null })
			?.customerVersion;

	test("a push older than the rows held is ignored, but still raises the version, and the held copy carries it", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 150n, readAt: 30 }),
		});

		const stored = await sqliteStore.setSubject({
			subject: subjectAt({
				logOffset: 140n,
				readAt: 20,
				customerVersion: 140n,
			}),
		});

		expect(stored).toBe(false);
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toMatchObject({ logOffset: 150n, customerVersion: 140n });
		sqliteStore.close();
	});

	test("never falls: an older evict's version, or a push with none, leaves it where it is", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
		});
		await sqliteStore.setSubject({
			subject: subjectAt({
				logOffset: 140n,
				readAt: 20,
				customerVersion: 140n,
			}),
		});

		await sqliteStore.setSubject({
			subject: subjectAt({
				logOffset: 120n,
				readAt: 21,
				customerVersion: 120n,
			}),
		});
		const afterOlderEvict = customerVersionOf(sqliteStore);
		await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 160n, readAt: 22 }),
		});

		expect(afterOlderEvict).toBe(140n);
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toMatchObject({
			logOffset: 160n,
			customerVersion: 140n,
		});
		sqliteStore.close();
	});

	test("survives a restart beside the rows, and an entity's part carries none", async () => {
		const databasePath = slotPath();
		const writer = openSqliteStore({ databasePath, held: freshHeld() });
		await writer.setSubjects({
			subjects: [
				subjectAt({ logOffset: 140n, readAt: 20, customerVersion: 140n }),
				subjectAt({ logOffset: 100n, readAt: 10, entityId: "ent_1" }),
			],
		});
		writer.close();

		const reopened = openSqliteStore({ databasePath, held: freshHeld() });

		expect(customerVersionOf(reopened)).toBe(140n);
		expect(
			reopened.readSubject({ customerId: "cus_1", entityId: "ent_1" }),
		).toMatchObject({ logOffset: 100n, customerVersion: 0n });
		reopened.close();
	});
});

describe("a slot file's footprint", () => {
	const pragma = (databasePath: string, name: string) => {
		const database = new Database(databasePath, { readonly: true });
		const value = database.query(`PRAGMA ${name}`).get() as Record<
			string,
			number
		>;
		database.close();
		return value[name];
	};

	test("a connection keeps 256 KiB of its file in memory, its log is cut back to 1 MiB after a checkpoint, and freed pages can be given back", () => {
		const databasePath = slotPath();
		const database = openSlotDatabase({ databasePath });

		expect(database.query("PRAGMA cache_size").get()).toEqual({
			cache_size: -256n,
		});
		expect(database.query("PRAGMA journal_size_limit").get()).toEqual({
			journal_size_limit: BigInt(1024 * 1024),
		});
		expect(pragma(databasePath, "auto_vacuum")).toBe(2);
		database.close();
	});

	test("a file of another version is rebuilt so its freed pages can be given back too", () => {
		const databasePath = slotPath();
		const older = new Database(databasePath, { create: true });
		older.run("CREATE TABLE subject_states (customer_id TEXT PRIMARY KEY)");
		older.run("PRAGMA user_version = 1");
		older.close();
		expect(pragma(databasePath, "auto_vacuum")).toBe(0);

		openSqliteStore({ databasePath, held: freshHeld() }).close();

		expect(pragma(databasePath, "auto_vacuum")).toBe(2);
	});

	const manyAt = ({ count, readAt }: { count: number; readAt: number }) =>
		Array.from({ length: count }, (_, i) => ({
			...subjectAt({ logOffset: 1n, readAt }),
			state: createSubjectState({
				identity: { ...identity, customerId: `cus_${readAt}_${i}` },
				customerEntitlements: Array.from({ length: 40 }, (_, j) => ({
					id: `ce_${i}_${j}`,
					internal_customer_id: "c",
					internal_entity_id: null,
					internal_feature_id: `f_${j}`,
					customer_product_id: "cp",
					entitlement_id: `e_${j}`,
					created_at: 1,
					unlimited: false,
					balance: 1000 - j,
					additional_balance: 0,
					usage_allowed: false,
					reset_cycle_anchor: null,
					next_reset_at: null,
					adjustment: 0,
					expires_at: null,
					external_id: null,
				})),
			}),
		}));

	test("drops whole customers written before a point, oldest write first, and their held copies with them", async () => {
		const databasePath = slotPath();
		let at = 1000;
		const held = freshHeld();
		const sqliteStore = openSqliteStore({ databasePath, held, now: () => at });
		await sqliteStore.setSubjects({
			subjects: [
				subjectAt({ logOffset: 1n }),
				{ ...subjectAt({ logOffset: 1n, entityId: "ent_1" }) },
			],
		});
		at = 2000;
		await sqliteStore.setSubject({
			subject: {
				...subjectAt({ logOffset: 1n }),
				state: createSubjectState({
					identity: { ...identity, customerId: "cus_2" },
				}),
			},
		});
		expect(held.size).toBe(3);

		const dropped = await sqliteStore.dropCustomersWrittenBefore({
			before: 1500,
			limit: 10,
		});

		expect(dropped).toEqual({ customers: 1, rows: 2 });
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: null }),
		).toBeNull();
		expect(
			sqliteStore.readSubject({ customerId: "cus_1", entityId: "ent_1" }),
		).toBeNull();
		expect(
			sqliteStore.readSubject({ customerId: "cus_2", entityId: null }),
		).not.toBeNull();
		expect(sqliteStore.countSubjects()).toBe(1);
		expect(held.size).toBe(1);
		expect(
			await sqliteStore.dropCustomersWrittenBefore({ before: 1500, limit: 10 }),
		).toEqual({ customers: 0, rows: 0 });
		sqliteStore.close();
	});

	test("a customer with any row written since the point stays whole: an old customer row under a fresh entity is not dropped", async () => {
		const databasePath = slotPath();
		let at = 1000;
		const sqliteStore = openSqliteStore({
			databasePath,
			held: freshHeld(),
			now: () => at,
		});
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 1n }) });
		at = 2000;
		await sqliteStore.setSubject({
			subject: subjectAt({ logOffset: 2n, entityId: "ent_1" }),
		});

		expect(
			await sqliteStore.dropCustomersWrittenBefore({ before: 1500, limit: 10 }),
		).toEqual({ customers: 0, rows: 0 });
		expect(sqliteStore.countSubjects()).toBe(2);
		expect(
			await sqliteStore.dropCustomersWrittenBefore({ before: 2500, limit: 10 }),
		).toEqual({ customers: 1, rows: 2 });
		sqliteStore.close();
	});

	test("the limit bounds the customers dropped per call, so a call's cost is bounded whatever the file holds", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: slotPath(),
			held: freshHeld(),
			now: () => 1000,
		});
		await sqliteStore.setSubjects({
			subjects: manyAt({ count: 50, readAt: 1 }),
		});

		expect(
			(
				await sqliteStore.dropCustomersWrittenBefore({
					before: 2000,
					limit: 20,
				})
			).customers,
		).toBe(20);
		expect(sqliteStore.countSubjects()).toBe(30);
		sqliteStore.close();
	});

	test("dropping customers gives the space back to the volume once the main thread checkpoints the file", async () => {
		const databasePath = slotPath();
		const sqliteStore = openSqliteStore({
			databasePath,
			held: freshHeld(),
			now: () => 1000,
		});
		const checkpointer = startWalCheckpointer({
			dataDir: join(databasePath, ".."),
			logger: quietLogger,
		});
		// The main thread's checkpointer reaches each file once per this many ticks.
		const checkpointEveryFile = () => {
			for (let tick = 0; tick < TICKS_PER_FILE; tick++)
				checkpointer.checkpoint();
		};
		await sqliteStore.setSubjects({
			subjects: manyAt({ count: 400, readAt: 1 }),
		});
		await sqliteStore.setSubjects({
			subjects: manyAt({ count: 400, readAt: 2 }),
		});
		checkpointEveryFile();
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 1n }) });
		const onVolume = () =>
			[databasePath, `${databasePath}-wal`].reduce(
				(sum, path) => sum + statSync(path).size,
				0,
			);
		const full = onVolume();
		expect(full).toBeGreaterThan(10_000_000);
		expect(sqliteStore.dataBytes()).toBeGreaterThan(10_000_000);

		while (
			(
				await sqliteStore.dropCustomersWrittenBefore({
					before: 2000,
					limit: 100,
				})
			).customers > 0
		);
		checkpointEveryFile();
		await sqliteStore.setSubject({ subject: subjectAt({ logOffset: 2n }) });

		expect(sqliteStore.countSubjects()).toBe(1);
		expect(sqliteStore.dataBytes()).toBeLessThan(100_000);
		// What is left on the volume is a near-empty file and a log cut back to its 1 MiB limit at most.
		expect(onVolume()).toBeLessThan(1.5 * 1024 * 1024);
		checkpointer.stop();
		sqliteStore.close();
	});
});
