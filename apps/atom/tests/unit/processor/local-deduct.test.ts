import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand } from "@autumn/balance-engine";
import { FeatureType } from "@autumn/shared";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
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

/** A slot with its journal on disk, so a failed commit is a real one. */
const openWritingSlot = async ({
	subject = storedSubjectWith({ balance: 1000 }),
}: {
	subject?: StoredSubject;
} = {}) => {
	const folder = mkdtempSync(join(tmpdir(), "atom-deduct-"));
	const journal = openJournal({
		databasePath: join(folder, "journal-000-of-001.sqlite"),
	});
	const slot = openSlotProcessor({ journal });
	cleanups.push(
		() => slot.close(),
		() => rmSync(folder, { recursive: true, force: true }),
	);
	await slot.processor.setSubject(subjectPushOf({ subject }));
	return { ...slot, journal };
};

const sendEvent = ({
	requiredBalance = 10,
	requestId = "atom_req_1",
	params = {},
}: {
	requiredBalance?: number;
	requestId?: string;
	params?: Partial<CheckRequest["params"]>;
} = {}) => ({
	...checkRequestFor({
		params: { send_event: true, required_balance: requiredBalance, ...params },
	}),
	requestId,
});

const owedSeqs = ({ journal }: { journal: Journal }) =>
	journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq);

describe("a send_event check the Atom deducts itself", () => {
	test("two concurrent send_event checks on one customer serialise: seq 1, 2; 1,000 -> 990 -> 980", async () => {
		const { processor, journal } = await openWritingSlot();

		const replies = await Promise.all(
			["atom_req_1", "atom_req_2"].map((requestId) =>
				checkResponseOf({ processor, request: sendEvent({ requestId }) }),
			),
		);

		expect(
			replies.map((reply) => [reply.allowed, reply.balance?.remaining]),
		).toEqual([
			[true, 990],
			[true, 980],
		]);
		expect(
			journal
				.owed({ customerId: "cus_1" })
				.map(({ seq, command }) => [seq, command.commandId]),
		).toEqual([
			[1, "atom_req_1"],
			[2, "atom_req_2"],
		]);
	});

	test("the journal row is the worker's own TrackCommand: granted already, so overflow", async () => {
		const { processor, journal } = await openWritingSlot();

		await processor.check({ request: sendEvent({ requiredBalance: 7 }) });

		const [entry] = journal.owed({ customerId: "cus_1" });
		expect<unknown>(parseTrackCommand({ input: entry?.command })).toEqual(
			entry?.command,
		);
		expect(entry?.command).toMatchObject({
			type: "track",
			commandId: "atom_req_1",
			requestId: "atom_req_1",
			identity: { customerId: "cus_1", entityId: null },
			featureId: "messages",
			internalFeatureId: "feat_messages",
			value: 7,
			overageBehavior: "overflow",
			enforceOverdueBlock: true,
			properties: null,
			usageEvent: { name: "messages", idempotencyKey: null, id: null },
		});
		// The caller sent no key, so the worker's track claims none: the seq is what refuses a resend.
		expect(entry?.command).not.toHaveProperty("idempotency");
		expect(journal.unsent({ limit: 10 })).toEqual([entry]);
	});

	test("skip_event journals the deduction without a usage event", async () => {
		const { processor, journal } = await openWritingSlot();

		await processor.check({
			request: sendEvent({ params: { skip_event: true } }),
		});

		expect(journal.owed({ customerId: "cus_1" })[0]?.command.usageEvent).toBe(
			null,
		);
	});

	test("a send_event past the balance is refused and journals nothing", async () => {
		const { processor, journal } = await openWritingSlot({
			subject: storedSubjectWith({ balance: 5 }),
		});

		const reply = await checkResponseOf({
			processor,
			request: sendEvent({ requiredBalance: 10 }),
		});

		expect([reply.allowed, reply.balance?.remaining]).toEqual([false, 5]);
		expect(owedSeqs({ journal })).toEqual([]);
	});

	test("atomic append: a throw before the commit leaves nothing owed, and the API answers instead", async () => {
		const { processor, journal } = await openWritingSlot();
		journal.close();

		expect(
			await forwardReasonOf(() => processor.check({ request: sendEvent() })),
		).toBe("journal_not_written");
		expect(owedSeqs({ journal })).toEqual([]);
	});

	test("a feature the Atom does not hold is the API's, with nothing journaled", async () => {
		const { processor, journal } = await openWritingSlot();

		expect(
			await forwardReasonOf(() =>
				processor.check({
					request: sendEvent({ params: { feature_id: "seats" } }),
				}),
			),
		).toBe("feature_not_stored");
		expect(owedSeqs({ journal })).toEqual([]);
	});

	test("a boolean feature's send_event is the API's, which refuses it", async () => {
		const subject = storedSubjectWith({ balance: 1000 });
		const asFlag: StoredSubject = {
			...subject,
			catalog: {
				...subject.catalog,
				features: Object.fromEntries(
					Object.entries(subject.catalog.features).map(([id, feature]) => [
						id,
						{ ...feature, type: FeatureType.Boolean },
					]),
				),
			},
		};
		const { processor, journal } = await openWritingSlot({ subject: asFlag });

		expect(
			await forwardReasonOf(() => processor.check({ request: sendEvent() })),
		).toBe("send_event");
		expect(owedSeqs({ journal })).toEqual([]);
	});

	test("an entity's send_event is still the API's", async () => {
		const { processor } = await openWritingSlot();

		expect(
			await forwardReasonOf(() =>
				processor.check({
					request: sendEvent({ params: { entity_id: "ent_42" } }),
				}),
			),
		).toBe("send_event");
	});
});

describe("a track the Atom deducts itself", () => {
	test("is journaled as the API's own track: what fits, keyed by the body's idempotency_key; answered as a queued track", async () => {
		const { processor, journal } = await openWritingSlot();

		const answer = await processor.track({
			request: trackRequestFor({
				params: { value: 7, idempotency_key: "evt_1" },
				idempotencyKey: "evt_1",
			}),
		});

		expect(answer).toEqual({ customer_id: "cus_1", value: 7, balance: null });
		const [entry] = journal.owed({ customerId: "cus_1" });
		expect<unknown>(parseTrackCommand({ input: entry?.command })).toEqual(
			entry?.command,
		);
		expect(entry?.command).toMatchObject({
			type: "track",
			commandId: "atom_req_1",
			featureId: "messages",
			value: 7,
			overageBehavior: "cap",
			usageEvent: { name: "messages", idempotencyKey: "evt_1", id: null },
			idempotency: { key: "track:evt_1", ttlMs: 86_400_000 },
		});
		expect(entry?.command.enforceOverdueBlock).not.toBe(true);
	});

	test("without a body key claims nothing at Autumn: the seq is what refuses a resend", async () => {
		const { processor, journal } = await openWritingSlot();

		await processor.track({ request: trackRequestFor() });

		expect(journal.owed({ customerId: "cus_1" })[0]?.command).toMatchObject({
			value: 1,
			usageEvent: { idempotencyKey: null },
		});
		expect(
			journal.owed({ customerId: "cus_1" })[0]?.command,
		).not.toHaveProperty("idempotency");
	});

	test("past the balance is the API's, which decides whether it caps, overflows or is refused; nothing is journaled", async () => {
		const { processor, journal } = await openWritingSlot({
			subject: storedSubjectWith({ balance: 5 }),
		});

		expect(
			await forwardReasonOf(() =>
				processor.track({
					request: trackRequestFor({ params: { value: 10 } }),
				}),
			),
		).toBe("track_denied");
		expect(owedSeqs({ journal })).toEqual([]);
	});
});
