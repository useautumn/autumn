import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomErrorOf } from "../../../src/http/handlers/errorHandler/atomErrorOf.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	storedSubjectWith,
	subjectPushOf,
	trackRequestFor,
} from "../utils/atomFixtures.js";
import { openSlotProcessor } from "../utils/journalFixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A slot holding `cus_1` and `cus_2` at `balance` messages, its journal on disk so a committed key is read back from the file. */
const openKeyedSlot = async ({ balance = 1000 }: { balance?: number } = {}) => {
	const folder = mkdtempSync(join(tmpdir(), "atom-keyed-"));
	const slot = openSlotProcessor({
		journal: openJournal({
			databasePath: join(folder, "journal-000-of-001.sqlite"),
		}),
	});
	cleanups.push(
		() => slot.close(),
		() => rmSync(folder, { recursive: true, force: true }),
	);
	const subject = storedSubjectWith({ balance });
	await slot.processor.setSubject(subjectPushOf({ subject }));
	const other = {
		...subject,
		state: {
			...subject.state,
			identity: { ...subject.state.identity, customerId: "cus_2" },
		},
	};
	await slot.processor.setSubject(subjectPushOf({ subject: other }));
	return slot;
};

let requests = 0;
const keyedTrack = ({
	key,
	value = 1,
	customerId = "cus_1",
}: {
	key: string;
	value?: number;
	customerId?: string;
}) => ({
	...trackRequestFor({
		params: { value, customer_id: customerId },
		idempotencyKey: key,
	}),
	requestId: `atom_req_${++requests}`,
});

const keyedCheck = ({
	key,
	params = {},
}: {
	key: string;
	params?: Partial<CheckRequest["params"]>;
}): CheckRequest => ({
	...checkRequestFor({
		params: { send_event: true, required_balance: 1, ...params },
	}),
	idempotencyKey: key,
	requestId: `atom_req_${++requests}`,
});

/** What the caller is answered when `run` fails as the Atom answers it itself; null when it succeeded. */
const answerOf = async (run: () => unknown) => {
	try {
		await run();
		return null;
	} catch (error) {
		return atomErrorOf({ cause: error as Error });
	}
};

const duplicateOf = (key: string) => ({
	status: 409 as const,
	code: "duplicate_idempotency_key",
	message: `Another request with idempotency key ${key} has already been received`,
});

describe("a keyed deduction on the Atom", () => {
	test("a keyed track retried is 409 in the API's words and journals nothing: one owed entry, one hand-in", async () => {
		const { processor, journal } = await openKeyedSlot();

		await processor.track({ request: keyedTrack({ key: "k1" }) });
		const retried = await answerOf(() =>
			processor.track({ request: keyedTrack({ key: "k1" }) }),
		);

		expect(retried).toEqual(duplicateOf("k1"));
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(journal.unsent({ limit: 10 })).toHaveLength(1);
	});

	test("a keyed deducting check retried is 409", async () => {
		const { processor, journal } = await openKeyedSlot();

		await checkResponseOf({ processor, request: keyedCheck({ key: "k1" }) });
		const retried = await answerOf(() =>
			processor.check({ request: keyedCheck({ key: "k1" }) }),
		);

		expect(retried).toEqual(duplicateOf("k1"));
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("a keyed lock check retried is 409, not the lock retry's allowed", async () => {
		const { processor, journal } = await openKeyedSlot();
		const lock = { lock: { enabled: true as const, lock_id: "lock_1" } };

		await checkResponseOf({
			processor,
			request: keyedCheck({ key: "k1", params: lock }),
		});
		const retried = await answerOf(() =>
			processor.check({ request: keyedCheck({ key: "k1", params: lock }) }),
		);

		expect(retried).toEqual(duplicateOf("k1"));
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("two keyed twins appended inside one group commit: one is deducted, one is 409", async () => {
		const { processor, journal } = await openKeyedSlot();

		const answers = await Promise.all([
			answerOf(() => processor.track({ request: keyedTrack({ key: "k1" }) })),
			answerOf(() => processor.track({ request: keyedTrack({ key: "k1" }) })),
		]);

		expect(answers).toEqual([null, duplicateOf("k1")]);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("a refused keyed track leaves the key free for its retry", async () => {
		const { processor, journal } = await openKeyedSlot({ balance: 5 });

		const refused = await forwardReasonOf(() =>
			processor.track({ request: keyedTrack({ key: "k1", value: 10 }) }),
		);
		await processor.track({ request: keyedTrack({ key: "k1", value: 1 }) });

		expect(refused).toBe("track_denied");
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("the same key from another customer is new", async () => {
		const { processor, journal } = await openKeyedSlot();

		await processor.track({ request: keyedTrack({ key: "k1" }) });
		await processor.track({
			request: keyedTrack({ key: "k1", customerId: "cus_2" }),
		});

		expect(journal.owed({ customerId: "cus_2" })).toHaveLength(1);
	});
});
