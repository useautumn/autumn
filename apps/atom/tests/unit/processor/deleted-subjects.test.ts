import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidPushError } from "../../../src/lib/contracts/invalidPushError.js";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import { createLaggingEntities } from "../../../src/state/laggingEntities/createLaggingEntities.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { createOpenLocks } from "../../../src/state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	checkRequestFor,
	checkResponseOf,
	deletedPushOf,
	forwardReasonOf,
	freshHeld,
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";

const directories: string[] = [];
const closers: (() => void)[] = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const slotPath = () => {
	const directory = mkdtempSync(join(tmpdir(), "atom-deleted-"));
	directories.push(directory);
	return join(directory, "slot-000.sqlite");
};

/** A slot over the file at `databasePath`, recording every subject its misses ask Autumn for. */
const createProcessor = ({
	databasePath = ":memory:",
}: {
	databasePath?: string;
} = {}) => {
	const sqliteStore = openSqliteStore({ databasePath, held: freshHeld() });
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	const journal = openJournal({ databasePath: ":memory:" });
	closers.push(
		() => sqliteStore.close(),
		() => catalogStore.close(),
		() => journal.close(),
	);
	const pulled: { customerId: string; entityId: string | null }[] = [];
	const processor = createSlotProcessor({
		ctx: {
			sqliteStore,
			catalogStore,
			logger: getAtomLogger(),
			subjectPulls: {
				request: (subject) => pulled.push(subject),
				settle: async () => {},
			},
			journal,
			openLocks: createOpenLocks(),
			laggingEntities: createLaggingEntities(),
		},
	});
	const checkCustomer = () =>
		checkResponseOf({ processor, request: checkRequestFor() });
	const checkEntity =
		(entityId = "ent_42") =>
		() =>
			checkResponseOf({
				processor,
				request: checkRequestFor({ params: { entity_id: entityId } }),
			});
	return { processor, sqliteStore, pulled, checkCustomer, checkEntity };
};

/** `cus_1` as Autumn sends it for its entity `entityId`, which holds 5 of its own. */
const entityPush = ({
	entityId = "ent_42",
	readAt = 1000,
}: {
	entityId?: string;
	readAt?: number;
} = {}) => {
	const subject = storedEntitySubjectWith({
		customerBalance: 10,
		entityBalance: 5,
		readAt,
	});
	const { identity, entity } = subject.state;
	return subjectPushOf({
		subject: {
			...subject,
			state: {
				...subject.state,
				identity: { ...identity, entityId },
				entity: entity && { ...entity, id: entityId },
			},
		},
	});
};

const customerAt = ({ balance, readAt }: { balance: number; readAt: number }) =>
	subjectPushOf({
		subject: { ...storedSubjectWith({ balance, readAt }), logOffset: 10n },
	});

describe("a customer Autumn deleted", () => {
	test("is left to the API, and pulled in case it was created again", async () => {
		const { processor, pulled, checkCustomer } = createProcessor();
		await processor.setSubject(customerAt({ balance: 10, readAt: 1000 }));

		const stored = await processor.deleteSubject(
			deletedPushOf({ logOffset: 20n, readAt: 2000 }),
		);

		expect(stored).toBe(true);
		expect(await forwardReasonOf(checkCustomer)).toBe("customer_deleted");
		expect(pulled).toEqual([{ customerId: "cus_1", entityId: null }]);
	});

	test("is never brought back by a push read before the delete, however late it lands", async () => {
		const { processor, checkCustomer } = createProcessor();
		await processor.deleteSubject(
			deletedPushOf({ logOffset: 20n, readAt: 2000 }),
		);

		const stored = await processor.setSubject(
			customerAt({ balance: 10, readAt: 1500 }),
		);

		expect(stored.stored).toBe(false);
		expect(await forwardReasonOf(checkCustomer)).toBe("customer_deleted");
	});

	test("is answered again once a push read after the delete lands: it was created again", async () => {
		const { processor, checkCustomer } = createProcessor();
		await processor.deleteSubject(
			deletedPushOf({ logOffset: 20n, readAt: 2000 }),
		);

		await processor.setSubject(customerAt({ balance: 7, readAt: 3000 }));

		expect(await checkCustomer()).toMatchObject({
			allowed: true,
			balance: { remaining: 7 },
		});
	});

	test("takes every entity with it: each is stored as deleted, and no check of one is answered", async () => {
		const { processor, sqliteStore, checkEntity } = createProcessor();
		await processor.setSubject(entityPush({ entityId: "ent_42" }));
		await processor.setSubject(entityPush({ entityId: "ent_7" }));

		await processor.deleteSubject(
			deletedPushOf({ logOffset: 20n, readAt: 2000 }),
		);

		for (const entityId of ["ent_42", "ent_7"]) {
			expect(
				sqliteStore.readSubject({ customerId: "cus_1", entityId })?.state,
			).toMatchObject({ deleted: true });
			expect(await forwardReasonOf(checkEntity(entityId))).toBe(
				"customer_deleted",
			);
		}
	});

	test("an entity's push read before the delete, landing after it, brings neither back", async () => {
		const { processor, checkEntity, checkCustomer } = createProcessor();
		await processor.setSubject(entityPush());
		await processor.deleteSubject(
			deletedPushOf({ logOffset: 20n, readAt: 2000 }),
		);

		await processor.setSubject(entityPush({ readAt: 1500 }));

		expect(await forwardReasonOf(checkEntity())).toBe("customer_deleted");
		expect(await forwardReasonOf(checkCustomer)).toBe("customer_deleted");
	});

	test("stays deleted across a restart: the file holds the deletion, not a gap", async () => {
		const databasePath = slotPath();
		const first = createProcessor({ databasePath });
		await first.processor.setSubject(customerAt({ balance: 10, readAt: 1000 }));
		await first.processor.deleteSubject(
			deletedPushOf({ logOffset: 20n, readAt: 2000 }),
		);
		first.sqliteStore.close();

		const reopened = createProcessor({ databasePath });

		expect(await forwardReasonOf(reopened.checkCustomer)).toBe(
			"customer_deleted",
		);
	});
});

describe("an entity Autumn deleted, of a customer it still holds", () => {
	const withDeletedEntity = async () => {
		const slot = createProcessor();
		await slot.processor.setSubject(entityPush());
		await slot.processor.deleteSubject(
			deletedPushOf({ entityId: "ent_42", logOffset: 20n, readAt: 2000 }),
		);
		return slot;
	};

	test("is left to the API, while its customer is still answered", async () => {
		const { checkEntity, checkCustomer } = await withDeletedEntity();

		expect(await forwardReasonOf(checkEntity())).toBe("entity_deleted");
		expect(await checkCustomer()).toMatchObject({ allowed: true });
	});

	test("is never brought back by a push of it read before the delete", async () => {
		const { processor, checkEntity } = await withDeletedEntity();

		const stored = await processor.setSubject(entityPush({ readAt: 1500 }));

		expect(stored.stored).toBe(false);
		expect(await forwardReasonOf(checkEntity())).toBe("entity_deleted");
	});
});

describe("a deletion push", () => {
	test("holding another customer than it was routed by is refused", async () => {
		const { processor } = createProcessor();
		const { body } = deletedPushOf({ logOffset: 20n, readAt: 2000 });

		await expect(
			processor.deleteSubject({ customerId: "cus_2", body }),
		).rejects.toThrow("names customer cus_1");
	});

	test("never lands as a set: subjects.set refuses its body and stores nothing", async () => {
		const { processor, checkCustomer } = createProcessor();

		await expect(
			processor.setSubject(deletedPushOf({ logOffset: 20n, readAt: 2000 })),
		).rejects.toBeInstanceOf(InvalidPushError);
		expect(await forwardReasonOf(checkCustomer)).toBe("customer_not_stored");
	});
});

describe("an evict that named one entity", () => {
	test("leaves a sibling entity read before it to the API, and pulls it: the customer's version moved for all its entities", async () => {
		const { processor, pulled, checkEntity, checkCustomer } = createProcessor();
		await processor.setSubject(entityPush({ entityId: "ent_42" }));
		await processor.setSubject(entityPush({ entityId: "ent_7" }));

		// Herald's customer push for an evict record naming ent_7, at the evict's offset.
		await processor.setSubject(
			subjectPushOf({
				subject: {
					...storedSubjectWith({ balance: 10, readAt: 1200 }),
					logOffset: 140n,
					customerVersion: 140n,
				},
			}),
		);

		expect(await forwardReasonOf(checkEntity("ent_42"))).toBe("entity_stale");
		expect(pulled).toContainEqual({ customerId: "cus_1", entityId: "ent_42" });
		expect(await checkCustomer()).toMatchObject({ allowed: true });
	});
});
