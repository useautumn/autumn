import { afterEach, describe, expect, test } from "bun:test";
import { LockNotFoundError } from "@autumn/balance-engine";
import {
	type FinalizeLockParamsV1,
	InsufficientBalanceError,
} from "@autumn/shared";
import { occurredAt as lockedAt } from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { atomErrorOf } from "../../../src/http/handlers/errorHandler/atomErrorOf.js";
import type { FinalizeRequest } from "../../../src/processor/types/finalize.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	latestApiVersion,
	storedSubjectWith,
	subjectPushOf,
	withAtomSeqs,
} from "../utils/atomFixtures.js";
import {
	createSlotFolder,
	openSlotProcessor,
} from "../utils/journalFixtures.js";

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

let requests = 0;
const lockOf = async ({
	processor,
	value,
	lockId = "lock_1",
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
	value: number;
	lockId?: string;
}) =>
	checkResponseOf({
		processor,
		request: {
			...checkRequestFor({
				params: {
					required_balance: value,
					lock: { enabled: true, lock_id: lockId },
				},
			}),
			requestId: `req_lock_${++requests}`,
		},
	});

const finalizeRequestFor = (
	params: Partial<FinalizeLockParamsV1>,
): FinalizeRequest => ({
	requestId: `req_finalize_${++requests}`,
	// A minute after the fixture's locks were taken, inside their 24-hour expiry.
	occurredAt: lockedAt + 60_000,
	params: {
		customer_id: "cus_1",
		lock_id: "lock_1",
		action: "release",
		...params,
	},
	apiVersion: latestApiVersion,
});

const remainingOf = async ({
	processor,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
}) =>
	(await checkResponseOf({ processor, request: checkRequestFor() })).balance
		?.remaining;

describe("a finalize on the Atom", () => {
	test("L3: a release before hand-in is journaled after its lock at the next seq, answered as the API answers, and gives the units back", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await lockOf({ processor, value: 30 });

		const reply = await processor.finalize({
			request: finalizeRequestFor({ action: "release" }),
		});

		expect(reply).toEqual({ success: true });
		expect(await remainingOf({ processor })).toBe(1000);
		const owed = journal.owed({ customerId: "cus_1" });
		expect(owed.map(({ seq, command }) => [seq, command.type])).toEqual([
			[1, "track"],
			[2, "finalize"],
		]);
		expect(owed[1]?.command).toMatchObject({
			type: "finalize",
			finalValue: 0,
			lock: { lock_id: "lock_1", customer_id: "cus_1" },
		});
	});

	test("a confirm settles the lock at the value it names: above the lock it takes the rest", async () => {
		const { processor } = await openHolding({ balance: 1000 });
		await lockOf({ processor, value: 30 });

		await processor.finalize({
			request: finalizeRequestFor({ action: "confirm", override_value: 50 }),
		});

		expect(await remainingOf({ processor })).toBe(950);
	});

	test("a confirm the balance cannot cover is refused as the API refuses it, journals nothing, and the lock stays open", async () => {
		const { processor, journal } = await openHolding({ balance: 40 });
		await lockOf({ processor, value: 30 });

		const refused = await processor
			.finalize({
				request: finalizeRequestFor({ action: "confirm", override_value: 50 }),
			})
			.catch((error: Error) => error);

		expect(refused).toBeInstanceOf(InsufficientBalanceError);
		expect(atomErrorOf({ cause: refused as Error })).toMatchObject({
			status: 400,
			code: "insufficient_balance",
		});
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(
			await processor.finalize({ request: finalizeRequestFor({}) }),
		).toEqual({ success: true });
	});

	test("L6: a finalize of a lock already settled here is refused as the API refuses it: 400 Lock not found", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await lockOf({ processor, value: 30 });
		await processor.finalize({ request: finalizeRequestFor({}) });

		const again = await processor
			.finalize({ request: finalizeRequestFor({}) })
			.catch((error: Error) => error);

		expect(again).toBeInstanceOf(LockNotFoundError);
		expect(atomErrorOf({ cause: again as Error })).toEqual({
			status: 400,
			code: "invalid_request",
			message: "Lock not found for ID: lock_1",
		});
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(2);
		expect(await remainingOf({ processor })).toBe(1000);
	});

	test("L8: a lock the API took is the API's to finalize: the Atom holds no row for it", async () => {
		const { processor } = await openHolding({ balance: 1000 });
		await processor.setSubject(
			subjectPushOf({
				subject: {
					...storedSubjectWith({ balance: 970, readAt: 2000 }),
					state: {
						...storedSubjectWith({ balance: 970 }).state,
						openLocks: [{ id: "lck_api", lock_id: "lock_api" }],
					},
				},
			}),
		);

		expect(
			await forwardReasonOf(() =>
				processor.finalize({
					request: finalizeRequestFor({ lock_id: "lock_api" }),
				}),
			),
		).toBe("lock_not_held");
	});

	test("B2: a finalize sent after its lock's expiry goes to the API, which settled it at expiry: nothing is settled or journaled here", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		const expiresAt = lockedAt + 60_000;
		await checkResponseOf({
			processor,
			request: checkRequestFor({
				params: {
					required_balance: 30,
					lock: { enabled: true, lock_id: "lock_1", expires_at: expiresAt },
				},
			}),
		});

		expect(
			await forwardReasonOf(() =>
				processor.finalize({
					request: {
						...finalizeRequestFor({ action: "confirm" }),
						occurredAt: expiresAt + 1,
					},
				}),
			),
		).toBe("lock_expired");
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("parked D1: a miss goes to the API", async () => {
		// L4, L5, L9: a lock taken on another replica before an owner move holds no row here, whatever this view shows.
		const taker = await openHolding({ balance: 1000 });
		await lockOf({ processor: taker.processor, value: 30 });
		const { processor } = await openHolding({ balance: 1000 });

		expect(
			await forwardReasonOf(() =>
				processor.finalize({ request: finalizeRequestFor({}) }),
			),
		).toBe("lock_not_held");
	});

	test("after a restart, the row of a lock still owed is rebuilt from the journal, and its finalize is answered here", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		const before = await openHolding({ balance: 1000, folder });
		await lockOf({ processor: before.processor, value: 30 });
		before.close();
		cleanups.splice(cleanups.indexOf(before.close), 1);

		const after = openSlotProcessor({
			subjectsPath: folder.subjectsPath,
			journal: openJournal({ databasePath: folder.journalPath }),
		});
		cleanups.push(after.close);

		expect(
			await after.processor.finalize({ request: finalizeRequestFor({}) }),
		).toEqual({ success: true });
		expect(await remainingOf({ processor: after.processor })).toBe(1000);
	});

	test("a row leaves once Autumn holds the lock and its finalize and no longer shows it open: a later finalize goes to the API", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await lockOf({ processor, value: 30 });
		await processor.finalize({ request: finalizeRequestFor({}) });

		await processor.setSubject(
			subjectPushOf({
				subject: withAtomSeqs({
					subject: storedSubjectWith({ balance: 1000, readAt: 2000 }),
					writerSeqs: { [journal.writerId]: 2 },
				}),
			}),
		);

		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(
			await forwardReasonOf(() =>
				processor.finalize({ request: finalizeRequestFor({}) }),
			),
		).toBe("lock_not_held");
	});
});
