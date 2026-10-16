/**
 * The finalize the route takes: appended to the journal as sent and answered once the append commits, with no read of
 * the subject or the lock. Autumn decides it where the journal lands.
 *
 *  a finalize after a lock taken here is journaled behind it at the next seq, naming only what the caller sent;
 *  the view still shows the lock held, since nothing is decided here until Autumn's push;
 *  a lock this slot never took, or a customer it never stored, is journaled and answered success all the same;
 *  the sqlite store and the open locks are never asked.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { occurredAt as lockedAt } from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { FinalizeRequest } from "../../../src/processor/types/finalize.js";
import type { SlotProcessorContext } from "../../../src/processor/types/slotProcessor.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import {
	checkRequestFor,
	checkResponseOf,
	latestApiVersion,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import { openSlotProcessor } from "../utils/journalFixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

let requests = 0;
const finalizeRequestFor = ({
	customerId = "cus_1",
	lockId = "lock_1",
	overrideValue,
}: {
	customerId?: string;
	lockId?: string;
	overrideValue?: number;
} = {}): FinalizeRequest => ({
	requestId: `req_finalize_${++requests}`,
	occurredAt: lockedAt + 60_000,
	params: {
		customer_id: customerId,
		lock_id: lockId,
		action: overrideValue === undefined ? "release" : "confirm",
		override_value: overrideValue,
	},
	apiVersion: latestApiVersion,
	movedFrom: null,
});

const openHolding = async ({ balance }: { balance: number }) => {
	const slot = openSlotProcessor();
	cleanups.push(slot.close);
	await slot.processor.setSubject(
		subjectPushOf({ subject: storedSubjectWith({ balance }) }),
	);
	return slot;
};

const remainingOf = async ({
	processor,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
}) =>
	(await checkResponseOf({ processor, request: checkRequestFor() })).balance
		?.remaining;

describe("a finalize left undecided", () => {
	test("is journaled behind the lock as sent, and the view keeps the lock held until Autumn's push", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });
		await checkResponseOf({
			processor,
			request: {
				...checkRequestFor({
					params: {
						required_balance: 30,
						lock: { enabled: true, lock_id: "lock_1" },
					},
				}),
				requestId: "req_lock",
			},
		});

		const reply = await processor.finalize({
			request: finalizeRequestFor({ overrideValue: 10 }),
		});

		expect(reply).toEqual({ success: true });
		expect(
			journal
				.owed({ customerId: "cus_1" })
				.map(({ seq, command }) => [seq, command.type]),
		).toEqual([
			[1, "track"],
			[2, "undecidedFinalize"],
		]);
		expect(journal.owed({ customerId: "cus_1" })[1]?.command).toEqual({
			type: "undecidedFinalize",
			requestId: "req_finalize_1",
			occurredAt: lockedAt + 60_000,
			customerId: "cus_1",
			lockId: "lock_1",
			finalValue: 10,
			properties: null,
		});
		expect(await remainingOf({ processor })).toBe(970);
	});

	test("a lock never taken here is journaled and answered success all the same", async () => {
		const { processor, journal } = await openHolding({ balance: 1000 });

		expect(
			await processor.finalize({
				request: finalizeRequestFor({ lockId: "lock_x" }),
			}),
		).toEqual({ success: true });
		expect(
			journal.owed({ customerId: "cus_1" }).map(({ command }) => command.type),
		).toEqual(["undecidedFinalize"]);
	});

	test("reads neither the subject nor the lock: a store and open locks that refuse every read never get asked", async () => {
		const journal = openJournal({ databasePath: ":memory:" });
		cleanups.push(journal.close);
		const refuse = (what: string) => () => {
			throw new Error(`The undecided finalize read ${what}`);
		};
		const ctx = {
			journal,
			sqliteStore: new Proxy(
				{},
				{ get: (_, key) => refuse(`sqliteStore.${String(key)}`) },
			),
			openLocks: new Proxy(
				{},
				{ get: (_, key) => refuse(`openLocks.${String(key)}`) },
			),
			catalogStore: { read: refuse("catalogStore.read") },
			subjectPulls: { request: refuse("subjectPulls.request") },
			logger: new Proxy({}, { get: () => () => {} }),
		} as unknown as SlotProcessorContext;
		const processor = createSlotProcessor({ ctx });

		expect(
			await processor.finalize({
				request: finalizeRequestFor({ customerId: "cus_never_stored" }),
			}),
		).toEqual({ success: true });
		expect(journal.owed({ customerId: "cus_never_stored" })).toHaveLength(1);
	});
});
