import { afterEach, describe, expect, test } from "bun:test";
import type { CheckLockParams } from "@autumn/shared";
import { atomErrorOf } from "../../../src/http/handlers/errorHandler/atomErrorOf.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
	withAtomSeqs,
} from "../utils/atomFixtures.js";
import {
	createSlotFolder,
	openSlotProcessor,
} from "../utils/journalFixtures.js";

const otherEntity = { id: "ent_7", internal_id: "ent_internal_7" };

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** `cus_1` holding `customerBalance` messages, and `ent_42` and `ent_7` `entityBalance` each of their own. */
const openWithEntities = async ({
	customerBalance,
	entityBalance,
}: {
	customerBalance: number;
	entityBalance: number;
}) => {
	const slot = openSlotProcessor();
	cleanups.push(slot.close);
	for (const ofEntity of [undefined, otherEntity])
		await slot.processor.setSubject(
			subjectPushOf({
				subject: storedEntitySubjectWith({
					customerBalance,
					entityBalance,
					ofEntity,
				}),
			}),
		);
	return slot;
};

const onEntity = ({
	entityId = "ent_42",
	params = {},
}: {
	entityId?: string | null;
	params?: Partial<CheckRequest["params"]>;
} = {}): CheckRequest => ({
	...checkRequestFor({
		params: { ...(entityId && { entity_id: entityId }), ...params },
	}),
	requestId: `req_${Math.random()}`,
});

const sendEvent = ({
	entityId,
	requiredBalance,
}: {
	entityId?: string | null;
	requiredBalance: number;
}) =>
	onEntity({
		entityId,
		params: { send_event: true, required_balance: requiredBalance },
	});

const remainingOn = async ({
	processor,
	entityId,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
	entityId?: string | null;
}) =>
	(await checkResponseOf({ processor, request: onEntity({ entityId }) }))
		.balance?.remaining;

/** A push of `subject` once Autumn applied this journal's entries up to `seq`. */
const pushSeen = ({
	processor,
	subject,
	writerId,
	seq,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
	subject: StoredSubject;
	writerId: string;
	seq: number;
}) =>
	processor.setSubject(
		subjectPushOf({
			subject: withAtomSeqs({ subject, writerSeqs: { [writerId]: seq } }),
		}),
	);

describe("a send_event on an entity the Atom deducts itself", () => {
	test("deducts the entity's own row, journals the worker's track under the entity, and leaves the customer's rows", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 0,
			entityBalance: 50,
		});

		const reply = await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 10 }),
		});

		expect(reply).toMatchObject({ allowed: true, entity_id: "ent_42" });
		expect(reply.balance?.remaining).toBe(40);
		expect(await remainingOn({ processor })).toBe(40);
		expect(await remainingOn({ processor, entityId: "ent_7" })).toBe(50);
		expect(await remainingOn({ processor, entityId: null })).toBe(0);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([
			expect.objectContaining({
				seq: 1,
				command: expect.objectContaining({
					type: "track",
					identity: expect.objectContaining({
						customerId: "cus_1",
						entityId: "ent_42",
					}),
					value: 10,
					overageBehavior: "overflow",
				}),
			}),
		]);
	});

	test("one drawn from the customer's pool moves the customer's view and every entity's", async () => {
		const { processor } = await openWithEntities({
			customerBalance: 100,
			entityBalance: 0,
		});

		await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 30 }),
		});

		expect(await remainingOn({ processor, entityId: null })).toBe(70);
		expect(await remainingOn({ processor, entityId: "ent_7" })).toBe(70);
		expect(await remainingOn({ processor })).toBe(70);
	});

	test("two entities deducting at once each draw their own row in seq order, the pool shared", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 100,
			entityBalance: 20,
		});

		const replies = await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				checkResponseOf({
					processor,
					request: sendEvent({
						entityId: index % 2 === 0 ? "ent_42" : "ent_7",
						requiredBalance: 5,
					}),
				}),
			),
		);

		expect(replies.every(({ allowed }) => allowed)).toBe(true);
		expect(journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual(
			[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
		);
		// 25 asked of each entity: its own 20, then 5 from the pool, twice.
		expect(await remainingOn({ processor, entityId: null })).toBe(90);
		expect(await remainingOn({ processor })).toBe(90);
		expect(await remainingOn({ processor, entityId: "ent_7" })).toBe(90);
	});

	test("one past the entity's balance and the pool is refused and journals nothing", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 10,
			entityBalance: 5,
		});

		const reply = await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 16 }),
		});

		expect(reply.allowed).toBe(false);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(await remainingOn({ processor })).toBe(15);
	});

	test("an entity the Atom does not hold goes to the API", async () => {
		const slot = openSlotProcessor();
		cleanups.push(slot.close);
		await slot.processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		expect(
			await forwardReasonOf(() =>
				slot.processor.check({ request: sendEvent({ requiredBalance: 1 }) }),
			),
		).toBe("entity_not_stored");
		expect(slot.journal.owed({ customerId: "cus_1" })).toEqual([]);
	});
});

describe("a lock on an entity the Atom takes itself", () => {
	const lock: CheckLockParams = { enabled: true, lock_id: "lock_1" };
	const lockOn = ({
		entityId,
		requiredBalance = 30,
	}: {
		entityId: string | null;
		requiredBalance?: number;
	}) =>
		onEntity({
			entityId,
			params: { required_balance: requiredBalance, lock },
		});

	test("holds what it reserves on the entity and journals one locked track under it", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 0,
			entityBalance: 50,
		});

		const reply = await checkResponseOf({
			processor,
			request: lockOn({ entityId: "ent_42" }),
		});

		expect(reply.allowed).toBe(true);
		expect(await remainingOn({ processor })).toBe(20);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([
			expect.objectContaining({
				command: expect.objectContaining({
					identity: expect.objectContaining({ entityId: "ent_42" }),
					value: 30,
					lock: expect.objectContaining({ lockId: "lock_1" }),
				}),
			}),
		]);
	});

	test("a retry on its terms holds nothing new; the same lock_id on another entity is the API's 409", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 0,
			entityBalance: 50,
		});
		await checkResponseOf({
			processor,
			request: lockOn({ entityId: "ent_42" }),
		});

		const retried = await checkResponseOf({
			processor,
			request: lockOn({ entityId: "ent_42" }),
		});
		const elsewhere = await processor
			.check({ request: lockOn({ entityId: "ent_7" }) })
			.catch((error: Error) => error);

		expect(retried.allowed).toBe(true);
		expect(atomErrorOf({ cause: elsewhere as Error })).toEqual({
			status: 409,
			code: "lock_already_exists",
			message: "lock_id already used with different terms",
		});
		expect(await remainingOn({ processor })).toBe(20);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});
});

describe("a push of one state trims only that state's entries, and each view replays what its own copies have not seen", () => {
	test("the customer's push past an entity's entry leaves it owed: the entity's view still deducts it once, the customer's not again", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 100,
			entityBalance: 50,
		});
		await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 10 }),
		});
		const { writerId } = journal;

		// Autumn applied it to the entity's own row; the customer's push lands first, its row already holding seq 1.
		await pushSeen({
			processor,
			subject: storedSubjectWith({ balance: 100, readAt: 2000 }),
			writerId,
			seq: 1,
		});

		expect(journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual(
			[1],
		);
		expect(await remainingOn({ processor })).toBe(140);
		expect(await remainingOn({ processor, entityId: null })).toBe(100);
		expect(await remainingOn({ processor, entityId: "ent_7" })).toBe(150);

		await pushSeen({
			processor,
			subject: storedEntitySubjectWith({
				customerBalance: 100,
				entityBalance: 40,
				readAt: 3000,
			}),
			writerId,
			seq: 1,
		});

		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(await remainingOn({ processor })).toBe(140);
	});

	test("one drawn from the entity's row and the pool is replayed on the entity's rows alone once the customer's copy holds it", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 100,
			entityBalance: 20,
		});
		// 20 of the entity's own, then 10 from the pool.
		await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 30 }),
		});
		expect(await remainingOn({ processor })).toBe(90);

		await pushSeen({
			processor,
			subject: storedSubjectWith({ balance: 90, readAt: 2000 }),
			writerId: journal.writerId,
			seq: 1,
		});

		expect(await remainingOn({ processor, entityId: null })).toBe(90);
		expect(await remainingOn({ processor })).toBe(90);
		expect(await remainingOn({ processor, entityId: "ent_7" })).toBe(110);
	});

	test("an entity's push past its entry trims it, and the customer's copy, read beside it, holds the entry too", async () => {
		const { processor, journal } = await openWithEntities({
			customerBalance: 100,
			entityBalance: 50,
		});
		await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 10 }),
		});
		await checkResponseOf({
			processor,
			request: sendEvent({ entityId: null, requiredBalance: 5 }),
		});
		const { writerId } = journal;

		await pushSeen({
			processor,
			subject: storedEntitySubjectWith({
				customerBalance: 95,
				entityBalance: 40,
				readAt: 2000,
			}),
			writerId,
			seq: 2,
		});

		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(await remainingOn({ processor })).toBe(135);
		expect(await remainingOn({ processor, entityId: null })).toBe(95);
	});

	test("after a restart the entity's entry is still owed, so its view deducts it until the entity's push", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		const open = () => {
			const slot = openSlotProcessor({
				subjectsPath: folder.subjectsPath,
				journal: openJournal({ databasePath: folder.journalPath }),
			});
			cleanups.push(slot.close);
			return slot;
		};
		const first = open();
		for (const ofEntity of [undefined, otherEntity])
			await first.processor.setSubject(
				subjectPushOf({
					subject: storedEntitySubjectWith({
						customerBalance: 100,
						entityBalance: 50,
						ofEntity,
					}),
				}),
			);
		await checkResponseOf({
			processor: first.processor,
			request: sendEvent({ requiredBalance: 10 }),
		});
		await pushSeen({
			processor: first.processor,
			subject: storedSubjectWith({ balance: 100, readAt: 2000 }),
			writerId: first.journal.writerId,
			seq: 1,
		});
		first.close();

		const second = open();

		expect(
			second.journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq),
		).toEqual([1]);
		expect(await remainingOn({ processor: second.processor })).toBe(140);
	});
});
