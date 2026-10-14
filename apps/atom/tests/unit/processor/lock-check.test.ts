import { afterEach, describe, expect, test } from "bun:test";
import type { CheckLockParams } from "@autumn/shared";
import { atomErrorOf } from "../../../src/http/handlers/errorHandler/atomErrorOf.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import {
	checkRequestFor,
	checkResponseOf,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import {
	createSlotFolder,
	openSlotProcessor,
	owedCommand,
} from "../utils/journalFixtures.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** `cus_1` holding `balance` messages on a slot whose files live in `folder`, or in memory. */
const openHolding = async ({
	balance,
	folder,
}: {
	balance: number;
	folder?: ReturnType<typeof createSlotFolder>;
}) => {
	const slot = openSlotProcessor(
		folder
			? {
					subjectsPath: folder.subjectsPath,
					journal: openJournal({ databasePath: folder.journalPath }),
				}
			: {},
	);
	cleanups.push(slot.close);
	await slot.processor.setSubject(
		subjectPushOf({ subject: storedSubjectWith({ balance }) }),
	);
	return slot;
};

const lockCheck = ({
	requiredBalance,
	lock,
}: {
	requiredBalance: number;
	lock: Partial<CheckLockParams>;
}) =>
	checkRequestFor({
		params: {
			required_balance: requiredBalance,
			lock: { enabled: true, lock_id: "lock_1", ...lock },
		},
	});

describe("a lock on the Atom", () => {
	test("holds what it reserves: the view shows the units held, and the journal owes one locked track", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		const request = lockCheck({ requiredBalance: 30, lock: {} });

		const reply = await checkResponseOf({ processor, request });

		expect(reply.allowed).toBe(true);
		expect(
			(await checkResponseOf({ processor, request: checkRequestFor() })).balance
				?.remaining,
		).toBe(970);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([
			expect.objectContaining({
				command: expect.objectContaining({
					value: 30,
					overageBehavior: "reject",
					lock: {
						id: expect.stringMatching(/^lck/),
						lockId: "lock_1",
						expiresAt: request.occurredAt + DAY_MS,
						expiryAction: "confirm",
					},
				}),
			}),
		]);
	});

	test("one that does not fit is refused and journals nothing; one that caps reserves only what fits", async () => {
		const { processor, journal } = await openHolding({ balance: 10 });

		const refused = await checkResponseOf({
			processor,
			request: lockCheck({ requiredBalance: 30, lock: {} }),
		});
		expect(refused.allowed).toBe(false);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);

		const capped = await checkResponseOf({
			processor,
			request: lockCheck({
				requiredBalance: 30,
				lock: { lock_id: "lock_2", overage_behavior: "cap" },
			}),
		});
		expect(capped.allowed).toBe(true);
		expect(
			(await checkResponseOf({ processor, request: checkRequestFor() })).balance
				?.remaining,
		).toBe(0);
	});

	test("D2: a lock_id retried on the terms it was taken with is the same lock: the reply a fresh lock gets, nothing deducted or journaled again", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		const request = lockCheck({ requiredBalance: 30, lock: {} });
		const first = await checkResponseOf({ processor, request });

		const retried = await checkResponseOf({
			processor,
			request: { ...request, requestId: "req_check_retry" },
		});

		expect(retried).toEqual(first);
		expect(retried.allowed).toBe(true);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(
			(await checkResponseOf({ processor, request: checkRequestFor() })).balance
				?.remaining,
		).toBe(970);
	});

	test("D2: a lock_id retried on other terms is refused with the API's 409, and nothing moves", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await checkResponseOf({
			processor,
			request: lockCheck({ requiredBalance: 30, lock: {} }),
		});

		const conflicts = [
			lockCheck({ requiredBalance: 40, lock: {} }),
			lockCheck({ requiredBalance: 30, lock: { overage_behavior: "cap" } }),
			lockCheck({
				requiredBalance: 30,
				lock: { expires_at: 1_900_000_000_000 },
			}),
		];
		for (const request of conflicts) {
			const refused = await processor
				.check({ request })
				.catch((error: Error) => error);
			expect(atomErrorOf({ cause: refused as Error })).toEqual({
				status: 409,
				code: "lock_already_exists",
				message: "lock_id already used with different terms",
			});
		}
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("D2: a lock_id the API took, open at Autumn with no row here, is refused as on base: 409", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await processor.setSubject(
			subjectPushOf({
				subject: {
					...storedSubjectWith({ balance: 970, readAt: 2000 }),
					state: {
						...storedSubjectWith({ balance: 970 }).state,
						openLocks: [{ id: "lck_api", lock_id: "lock_1" }],
					},
				},
			}),
		);

		const refused = await processor
			.check({ request: lockCheck({ requiredBalance: 30, lock: {} }) })
			.catch((error: Error) => error);

		expect(atomErrorOf({ cause: refused as Error })).toEqual({
			status: 409,
			code: "lock_already_exists",
			message: "A lock with this ID already exists",
		});
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
	});

	test("L10: a lock_id retried after a crash, its lock still owed, is still the same lock: allowed once, one hold, one entry", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		const request = lockCheck({ requiredBalance: 30, lock: {} });
		const before = await openHolding({ balance: 1000, folder });
		const first = await checkResponseOf({
			processor: before.processor,
			request,
		});
		before.close();
		cleanups.splice(cleanups.indexOf(before.close), 1);

		const after = openSlotProcessor({
			subjectsPath: folder.subjectsPath,
			journal: openJournal({ databasePath: folder.journalPath }),
		});
		cleanups.push(after.close);
		const retried = await checkResponseOf({
			processor: after.processor,
			request: { ...request, requestId: "req_check_retry" },
		});

		expect(retried).toEqual(first);
		expect(after.journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(
			(
				await checkResponseOf({
					processor: after.processor,
					request: checkRequestFor(),
				})
			).balance?.remaining,
		).toBe(970);
	});

	test("a journaled lock whose lock_id Autumn already holds open moves nothing in the view, as the worker refuses it", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await processor.setSubject(
			subjectPushOf({
				subject: {
					...storedSubjectWith({ balance: 1000, readAt: 2000 }),
					state: {
						...storedSubjectWith({ balance: 1000 }).state,
						openLocks: [{ id: "lck_api", lock_id: "lock_1" }],
					},
				},
			}),
		);
		await journal.append({
			customerId: "cus_1",
			command: {
				...owedCommand({ commandId: "locked_twice", value: 30 }),
				lock: {
					id: "lck_atom",
					lockId: "lock_1",
					expiresAt: 1_900_000_000_000,
					expiryAction: "confirm",
				},
			},
		});

		expect(
			(await checkResponseOf({ processor, request: checkRequestFor() })).balance
				?.remaining,
		).toBe(1000);
	});
});
