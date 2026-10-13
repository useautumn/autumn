import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readCurrentSubject } from "../../../src/processor/actions/readCurrentSubject/readCurrentSubject.js";
import * as replay from "../../../src/processor/actions/readCurrentSubject/replayOwed.js";
import { commandsSeenBy } from "../../../src/state/journal/commandsSeenBy.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import {
	checkRequestFor,
	checkResponseOf,
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import {
	createSlotFolder,
	openSlotProcessor,
	owedCommand,
} from "../utils/journalFixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

const openSlot = ({
	seenBy = commandsSeenBy,
}: {
	seenBy?: typeof commandsSeenBy;
} = {}) => {
	const folder = createSlotFolder();
	const open = () => {
		const journal = openJournal({ databasePath: folder.journalPath, seenBy });
		const slot = openSlotProcessor({
			subjectsPath: folder.subjectsPath,
			journal,
		});
		return { ...slot, journal };
	};
	const slot = open();
	cleanups.push(folder.remove);
	let current = slot;
	cleanups.unshift(() => current.close());
	return {
		...slot,
		/** Closes both files and opens them again, as a restarted thread does. */
		reopen: () => {
			current.close();
			current = open();
			return current;
		},
	};
};

const pushBalance = async ({
	processor,
	balance,
	readAt = 1000,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
	balance: number;
	readAt?: number;
}) =>
	processor.setSubject(
		subjectPushOf({ subject: storedSubjectWith({ balance, readAt }) }),
	);

const remainingOf = async ({
	processor,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
}) =>
	(await checkResponseOf({ processor, request: checkRequestFor() })).balance
		?.remaining;

const owe = ({ journal, value }: { journal: Journal; value: number }) =>
	journal.append({
		customerId: "cus_1",
		command: owedCommand({
			commandId: `owed_${value}_${Math.random()}`,
			value,
		}),
	});

describe("the derived view: Autumn's snapshot with what the Atom owes replayed on top", () => {
	test("view: pushed 900 + pending -10 = 890", async () => {
		const { processor, journal } = openSlot();
		await pushBalance({ processor, balance: 900 });

		await owe({ journal, value: 10 });

		expect(await remainingOf({ processor })).toBe(890);
	});

	test("view: a push that carries the entry as seen gives 890 with pending empty (reconcile seam, stubbed until PR 2)", async () => {
		const { processor, journal } = openSlot({
			seenBy: ({ owed }) => owed.map(({ seq }) => seq),
		});
		await pushBalance({ processor, balance: 900 });
		await owe({ journal, value: 10 });

		await pushBalance({ processor, balance: 890, readAt: 2000 });

		expect(await remainingOf({ processor })).toBe(890);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
	});

	test("a push older than the held one is refused and pending untouched", async () => {
		const { processor, journal } = openSlot({
			seenBy: ({ owed }) => owed.map(({ seq }) => seq),
		});
		await pushBalance({ processor, balance: 900, readAt: 2000 });
		await owe({ journal, value: 10 });

		expect(await pushBalance({ processor, balance: 500, readAt: 1000 })).toBe(
			false,
		);

		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(await remainingOf({ processor })).toBe(890);
	});

	test("restart: pending rows survive a reopen and the view includes them", async () => {
		const slot = openSlot();
		await pushBalance({ processor: slot.processor, balance: 900 });
		await owe({ journal: slot.journal, value: 10 });

		const { processor } = slot.reopen();

		expect(await remainingOf({ processor })).toBe(890);
	});

	test("a rejected entry disappears from the view", async () => {
		const { processor, journal } = openSlot();
		await pushBalance({ processor, balance: 900 });
		const entry = await owe({ journal, value: 10 });
		expect(await remainingOf({ processor })).toBe(890);

		journal.setStatus({
			customerId: "cus_1",
			seq: entry.seq,
			status: { kind: "rejected", code: "insufficient_balance" },
		});

		expect(await remainingOf({ processor })).toBe(900);
	});

	test("a sent entry stays in the view until a push shows it applied", async () => {
		const { processor, journal } = openSlot();
		await pushBalance({ processor, balance: 900 });
		const entry = await owe({ journal, value: 10 });

		journal.setStatus({
			customerId: "cus_1",
			seq: entry.seq,
			status: { kind: "sent" },
		});

		expect(await remainingOf({ processor })).toBe(890);
	});
});

describe("the view is memoised", () => {
	test("memo: 10k reads on a customer with an empty journal never call replay", async () => {
		const { processor, ctx } = openSlot();
		await pushBalance({ processor, balance: 900 });
		const replayed = spyOn(replay, "replayOwed");
		cleanups.push(() => replayed.mockRestore());

		for (let read = 0; read < 10_000; read++)
			readCurrentSubject({ ctx, customerId: "cus_1", entityId: null });

		expect(replayed).not.toHaveBeenCalled();
	});

	test("memo: with entries owed, the view is replayed once per change, not once per read", async () => {
		const { processor, ctx, journal } = openSlot();
		await pushBalance({ processor, balance: 900 });
		await owe({ journal, value: 10 });
		const replayed = spyOn(replay, "replayOwed");
		cleanups.push(() => replayed.mockRestore());

		const first = readCurrentSubject({
			ctx,
			customerId: "cus_1",
			entityId: null,
		});
		for (let read = 0; read < 1000; read++)
			expect(
				readCurrentSubject({ ctx, customerId: "cus_1", entityId: null }),
			).toBe(first);
		await owe({ journal, value: 5 });
		readCurrentSubject({ ctx, customerId: "cus_1", entityId: null });
		await pushBalance({ processor, balance: 880, readAt: 2000 });
		readCurrentSubject({ ctx, customerId: "cus_1", entityId: null });

		expect(replayed).toHaveBeenCalledTimes(3);
	});

	test("an entity's view carries what its customer owes, since a customer's deduction moves the customer's own rows", async () => {
		const { processor, journal, ctx } = openSlot();
		await pushBalance({ processor, balance: 900 });
		await processor.setSubject(
			subjectPushOf({
				subject: storedEntitySubjectWith({
					customerBalance: 900,
					entityBalance: 5,
					readAt: 1000,
				}),
			}),
		);
		await owe({ journal, value: 10 });

		const view = readCurrentSubject({
			ctx,
			customerId: "cus_1",
			entityId: "ent_42",
		});

		expect(
			view.fullSubject.customer_products
				.flatMap(({ customer_entitlements }) => customer_entitlements)
				.map(({ id, balance }) => [id, balance]),
		).toContainEqual(["messages_monthly", 890]);
	});
});
