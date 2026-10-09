/**
 * Pulls against a real slot folder, each race forced step by step: Autumn's answer is a deferred the test settles,
 * herald's push is applied at the chosen step, and the clock is the test's.
 *
 *  R11  a pull in flight loses to a newer push that lands first: the push is kept, no fill, no further pull;
 *  R5   an evict lands between a pull's read and its store: the entity is stored but stale, and is pulled again and answered;
 *  R14  a subject Autumn does not have: forwarded, one pull, then held;
 *  5.13 + 5.16 the miss is still forwarded while its pull is in flight; a check left to the API by its own rules pulls nothing.
 */

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutumnClientError } from "../../../src/autumnClient/autumnClientError.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openSlots } from "../../../src/slots/openSlots.js";
import type { Slots } from "../../../src/slots/types/slots.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import {
	createSubjectPulls,
	PULL_HOLD_MS,
} from "../../../src/subjectPulls/createSubjectPulls.js";
import type { ThreadStatField } from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	freshHeld,
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";

/** Every promise continuation already queued runs before a macrotask: a settled pull is fully stored after this. */
const drainMicrotasks = () =>
	new Promise<void>((resolve) => setImmediate(resolve));

type CheckParams = Partial<CheckRequest["params"]>;

const opened: Slots[] = [];
const folders: string[] = [];
afterEach(() => {
	for (const slots of opened.splice(0)) slots.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

/** One folder whose misses pull through a deferred Autumn, on a clock the test moves. */
const openPullingFolder = () => {
	let now = 0;
	const counted: Partial<Record<ThreadStatField, number>> = {};
	const calls: {
		customerId: string;
		entityId: string | null;
		answer(result: string | Error): Promise<void>;
	}[] = [];
	const subjectPulls = createSubjectPulls({
		ctx: {
			autumnClient: {
				readSubject: ({ customerId, entityId }) => {
					const reply = Promise.withResolvers<string>();
					calls.push({
						customerId,
						entityId,
						answer: async (result) => {
							if (result instanceof Error) reply.reject(result);
							else reply.resolve(result);
							await drainMicrotasks();
						},
					});
					return reply.promise;
				},
			},
			counters: {
				add: (field, by = 1) => {
					counted[field] = (counted[field] ?? 0) + by;
				},
			},
			logger: { warn() {} },
			now: () => now,
		},
	});
	const folder = mkdtempSync(join(tmpdir(), "atom-pull-races-"));
	folders.push(folder);
	const slots = openSlots({
		folder,
		slotCount: 2,
		owners: allSlotsOwnedHere,
		held: freshHeld(),
		pulls: { subjectPulls, tokenHash: () => "hash_folder" },
	});
	opened.push(slots);
	const processor = slots.processorFor({ customerId: "cus_1" });
	return {
		calls,
		counted,
		advance: (ms: number) => {
			now += ms;
		},
		/** Herald's push, or a pulled body as Autumn returns it: the same text into the same apply. */
		bodyOf: (subject: StoredSubject) => subjectPushOf({ subject }).body,
		push: (subject: StoredSubject) =>
			processor.setSubject(subjectPushOf({ subject })),
		check: (params: CheckParams = {}) =>
			checkResponseOf({ processor, request: checkRequestFor({ params }) }),
		forwardOf: (params: CheckParams = {}) =>
			forwardReasonOf(() =>
				processor.check({ request: checkRequestFor({ params }) }),
			),
	};
};

const customerAt = ({
	balance,
	logOffset,
	readAt,
	customerVersion = 0n,
}: {
	balance: number;
	logOffset: bigint;
	readAt: number;
	customerVersion?: bigint;
}): StoredSubject => ({
	...storedSubjectWith({ balance, readAt }),
	logOffset,
	customerVersion,
});

const entityAt = ({
	entityBalance,
	logOffset,
	readAt,
}: {
	entityBalance: number;
	logOffset: bigint;
	readAt: number;
}): StoredSubject => ({
	...storedEntitySubjectWith({ customerBalance: 0, entityBalance, readAt }),
	logOffset,
});

const ENTITY_CHECK = { entity_id: "ent_42", required_balance: 1 };

test("R11 a pull in flight loses to a newer push that lands first: the push is kept, no fill, no further pull", async () => {
	const atom = openPullingFolder();
	expect(await atom.forwardOf()).toBe("customer_not_stored");
	expect(atom.calls).toHaveLength(1);

	expect(
		await atom.push(customerAt({ balance: 7, logOffset: 105n, readAt: 20 })),
	).toBe(true);
	await atom.calls[0]?.answer(
		atom.bodyOf(customerAt({ balance: 3, logOffset: 100n, readAt: 10 })),
	);

	expect(await atom.check()).toMatchObject({ balance: { remaining: 7 } });
	expect(atom.counted.subjectFills).toBeUndefined();

	// The kept copy answers every later check here, so nothing misses and nothing pulls again.
	expect(await atom.forwardOf()).toBeNull();
	expect(atom.calls).toHaveLength(1);
});

test("R5 an evict lands between a pull's read and its store: the entity is stored stale, pulled again, then answered", async () => {
	const atom = openPullingFolder();
	await atom.push(customerAt({ balance: 0, logOffset: 90n, readAt: 5 }));

	// The pull reads the entity at offset 130; before it lands, herald pushes the customer evicted at 140.
	expect(await atom.forwardOf(ENTITY_CHECK)).toBe("entity_not_stored");
	const pulled = atom.bodyOf(
		entityAt({ entityBalance: 4, logOffset: 130n, readAt: 30 }),
	);
	expect(
		await atom.push(
			customerAt({
				balance: 0,
				logOffset: 145n,
				readAt: 40,
				customerVersion: 140n,
			}),
		),
	).toBe(true);
	await atom.calls[0]?.answer(pulled);

	// The entity's own part is stored (a fill), its customer part refused as older, and 130 < 140 makes it stale.
	expect(atom.counted.subjectFills).toBe(1);
	expect(await atom.forwardOf(ENTITY_CHECK)).toBe("entity_stale");
	expect(atom.calls).toHaveLength(1);

	atom.advance(PULL_HOLD_MS);
	expect(await atom.forwardOf(ENTITY_CHECK)).toBe("entity_stale");
	expect(atom.calls).toHaveLength(2);
	await atom.calls[1]?.answer(
		atom.bodyOf(entityAt({ entityBalance: 4, logOffset: 150n, readAt: 50 })),
	);

	expect(await atom.forwardOf(ENTITY_CHECK)).toBeNull();
	expect(await atom.check(ENTITY_CHECK)).toMatchObject({
		allowed: true,
		balance: { remaining: 4 },
	});
	expect(atom.counted).toMatchObject({
		subjectMisses: 3,
		subjectPulls: 2,
		subjectFills: 2,
	});
});

test("R14 a subject Autumn does not have: forwarded, one pull, then held", async () => {
	const atom = openPullingFolder();
	expect(await atom.forwardOf()).toBe("customer_not_stored");
	await atom.calls[0]?.answer(
		new AutumnClientError({
			path: "/atom/subjects.read",
			status: 404,
			code: "subject_not_found",
		}),
	);

	atom.advance(PULL_HOLD_MS - 1);
	expect(await atom.forwardOf()).toBe("customer_not_stored");
	expect(atom.calls).toHaveLength(1);
	atom.advance(1);
	expect(await atom.forwardOf()).toBe("customer_not_stored");
	expect(atom.calls).toHaveLength(2);
});

test("5.13 + 5.16 a miss is forwarded while its pull is in flight; a check the API answers by rule pulls nothing", async () => {
	const atom = openPullingFolder();
	expect(await atom.forwardOf()).toBe("customer_not_stored");
	expect(await atom.forwardOf()).toBe("customer_not_stored");
	expect(atom.calls).toHaveLength(1);

	expect(await atom.forwardOf({ send_event: true })).toBe("send_event");
	expect(atom.counted).toEqual({ subjectMisses: 2, subjectPulls: 1 });

	await atom.calls[0]?.answer(
		atom.bodyOf(customerAt({ balance: 2, logOffset: 1n, readAt: 1 })),
	);
	expect(await atom.check()).toMatchObject({ balance: { remaining: 2 } });
});
