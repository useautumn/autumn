import { afterEach, describe, expect, test } from "bun:test";
import { LockAlreadyExistsError } from "@autumn/balance-engine";
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

	test("L10: a lock_id retried after a crash, its lock still open, is refused as the worker refuses it: 409 lock_already_exists", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		const request = lockCheck({ requiredBalance: 30, lock: {} });
		const before = await openHolding({ balance: 1000, folder });
		await checkResponseOf({ processor: before.processor, request });
		before.close();
		cleanups.splice(cleanups.indexOf(before.close), 1);

		const after = openSlotProcessor({
			subjectsPath: folder.subjectsPath,
			journal: openJournal({ databasePath: folder.journalPath }),
		});
		cleanups.push(after.close);
		const retried = await after.processor
			.check({ request })
			.catch((error: Error) => error);

		expect(retried).toBeInstanceOf(LockAlreadyExistsError);
		expect(atomErrorOf({ cause: retried as Error })).toEqual({
			status: 409,
			code: "lock_already_exists",
			message: "A lock with this ID already exists",
		});
		expect(after.journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});
});
