import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErrCode } from "@autumn/shared";
import { atomErrorOf } from "../../../src/http/handlers/errorHandler/atomErrorOf.js";
import { DuplicateIdempotencyKeyError } from "../../../src/processor/actions/track/duplicateIdempotencyKeyError.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import {
	errorToReply,
	replyToError,
} from "../../../src/threads/owners/ownerCallContract.js";
import {
	checkRequestFor,
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

/** A slot whose journal is on disk, so its keys are read back from journal_keys once committed. */
const openKeyedSlot = async ({ balance = 1000 }: { balance?: number } = {}) => {
	const folder = mkdtempSync(join(tmpdir(), "atom-keyed-"));
	const journal = openJournal({
		databasePath: join(folder, "journal-000-of-001.sqlite"),
	});
	const slot = openSlotProcessor({ journal });
	cleanups.push(
		() => slot.close(),
		() => rmSync(folder, { recursive: true, force: true }),
	);
	await slot.processor.setSubject(
		subjectPushOf({ subject: storedSubjectWith({ balance }) }),
	);
	return slot;
};

const keyedTrack = ({
	key,
	requestId,
	value = 1,
}: {
	key: string;
	requestId: string;
	value?: number;
}) => ({
	...trackRequestFor({ params: { value }, idempotencyKey: key }),
	requestId,
});

const keyedCheck = ({
	key,
	requestId,
}: {
	key: string;
	requestId: string;
}): CheckRequest => ({
	...checkRequestFor({ params: { send_event: true, required_balance: 1 } }),
	idempotencyKey: key,
	requestId,
});

const duplicateKeyOf = async (run: () => unknown): Promise<string | null> => {
	try {
		await run();
		return null;
	} catch (error) {
		if (error instanceof DuplicateIdempotencyKeyError) return error.key;
		throw error;
	}
};

describe("keyed deductions", () => {
	test("a keyed track retried is a duplicate and journals nothing", async () => {
		const { processor, journal } = await openKeyedSlot();

		await processor.track({
			request: keyedTrack({ key: "k1", requestId: "atom_req_1" }),
		});
		const duplicate = await duplicateKeyOf(() =>
			processor.track({
				request: keyedTrack({ key: "k1", requestId: "atom_req_2" }),
			}),
		);

		expect(duplicate).toBe("k1");
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(journal.unsent({ limit: 10 })).toHaveLength(1);
	});

	test("a keyed deducting check retried is a duplicate", async () => {
		const { processor, journal } = await openKeyedSlot();

		await processor.check({
			request: keyedCheck({ key: "k1", requestId: "atom_req_1" }),
		});
		const duplicate = await duplicateKeyOf(() =>
			processor.check({
				request: keyedCheck({ key: "k1", requestId: "atom_req_2" }),
			}),
		);

		expect(duplicate).toBe("k1");
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("two keyed twins inside one group commit: one is taken, one is a duplicate", async () => {
		const { processor, journal } = await openKeyedSlot();

		const settled = await Promise.allSettled([
			processor.track({
				request: keyedTrack({ key: "k1", requestId: "atom_req_1" }),
			}),
			processor.track({
				request: keyedTrack({ key: "k1", requestId: "atom_req_2" }),
			}),
		]);

		expect(settled.map(({ status }) => status)).toEqual([
			"fulfilled",
			"rejected",
		]);
		expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(
			DuplicateIdempotencyKeyError,
		);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("a refused keyed track leaves the key free for its retry", async () => {
		const { processor, journal } = await openKeyedSlot({ balance: 5 });

		const refused = await forwardReasonOf(() =>
			processor.track({
				request: keyedTrack({ key: "k1", requestId: "atom_req_1", value: 10 }),
			}),
		);
		await processor.track({
			request: keyedTrack({ key: "k1", requestId: "atom_req_2", value: 1 }),
		});

		expect(refused).toBe("track_denied");
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("unkeyed deductions never read or take a key", async () => {
		const { processor, journal } = await openKeyedSlot();

		await processor.track({
			request: { ...trackRequestFor(), requestId: "atom_req_1" },
		});
		await processor.track({
			request: { ...trackRequestFor(), requestId: "atom_req_2" },
		});

		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(2);
	});

	test("a duplicate crosses to the caller's thread and is answered 409 in the API's words", () => {
		const reply = errorToReply({
			id: 1,
			error: new DuplicateIdempotencyKeyError({ key: "k1" }),
		});
		if (reply.ok) throw new Error("expected a failed reply");
		const cause = replyToError({ ...reply, thread: 0 });

		expect(atomErrorOf({ cause })).toEqual({
			status: 409,
			code: ErrCode.DuplicateIdempotencyKey,
			message:
				"Another request with idempotency key k1 has already been received",
		});
	});
});
