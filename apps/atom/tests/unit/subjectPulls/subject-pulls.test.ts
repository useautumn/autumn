/**
 * A thread's pulls, driven step by step: each call to Autumn is a deferred the test settles, and the clock is the test's.
 *
 *  5.1 one miss, one pull; 5.2 (R10) misses of a subject already pulled never pull it again;
 *  5.3 past the in-flight cap a miss is dropped, not held; any answer holds the subject 30 s from its miss;
 *  only a stored body is a fill; an unknown token (the shadow's) holds the whole folder, unlogged;
 *  failures are logged at most once per hold; 5.14 once stopped nothing is pulled or stored.
 */

import { describe, expect, test } from "bun:test";
import { AutumnClientError } from "../../../src/autumnClient/autumnClientError.js";
import {
	createSubjectPulls,
	MAX_PULLS_IN_FLIGHT,
	PULL_HOLD_MS,
} from "../../../src/subjectPulls/createSubjectPulls.js";
import type { ApplyPulled } from "../../../src/subjectPulls/types/subjectPulls.js";
import type { ThreadStatField } from "../../../src/threads/stats/threadStats.js";

const MINUTE_MS = 60_000;

/** Every promise continuation already queued runs before a macrotask: a settled pull is fully applied after this. */
const drainMicrotasks = () =>
	new Promise<void>((resolve) => setImmediate(resolve));

const refusal = ({ status, code }: { status: number; code: string }) =>
	new AutumnClientError({ path: "/atom/subjects.read", status, code });

const NOT_FOUND = refusal({ status: 404, code: "subject_not_found" });
const NOT_HELD = refusal({ status: 409, code: "subject_not_held" });
const ATOM_UNKNOWN = refusal({ status: 401, code: "atom_unknown" });
const WORKER_DOWN = refusal({ status: 503, code: "worker_unavailable" });

/** A thread's pulls whose every call to Autumn waits for the test to answer it: a body, or the error it rejects with. */
const createHarness = ({
	applyPulled = async () => true,
}: {
	applyPulled?: ApplyPulled;
} = {}) => {
	let now = 0;
	const counted: Partial<Record<ThreadStatField, number>> = {};
	const warnings: unknown[] = [];
	const calls: {
		tokenHash: string;
		customerId: string;
		entityId: string | null;
		answer(result: string | Error): Promise<void>;
	}[] = [];
	const applied: { customerId: string; body: string }[] = [];
	const subjectPulls = createSubjectPulls({
		ctx: {
			autumnClient: {
				readSubject: ({ tokenHash, customerId, entityId }) => {
					const reply = Promise.withResolvers<string>();
					calls.push({
						tokenHash,
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
			logger: { warn: (fields: unknown) => warnings.push(fields) },
			now: () => now,
		},
	});
	const folder = subjectPulls.forFolder({
		tokenHash: () => "hash_folder",
		applyPulled: async (params) => {
			applied.push(params);
			return applyPulled(params);
		},
	});
	return {
		subjectPulls,
		calls,
		applied,
		counted,
		warnings,
		advance: (ms: number) => {
			now += ms;
		},
		miss: (customerId = "cus_1", entityId: string | null = null) =>
			folder.request({ customerId, entityId }),
	};
};

describe("one pull per subject", () => {
	test("5.1 a miss pulls the subject once, with the folder's token hash", () => {
		const harness = createHarness();
		harness.miss("cus_1", "ent_1");
		expect(harness.calls.map(({ answer, ...call }) => call)).toEqual([
			{ tokenHash: "hash_folder", customerId: "cus_1", entityId: "ent_1" },
		]);
		expect(harness.counted).toEqual({ subjectMisses: 1, subjectPulls: 1 });
	});

	test("5.2 (R10) fifty misses while it is in flight: still one pull; the entity is another subject", () => {
		const harness = createHarness();
		harness.miss();
		for (let i = 0; i < 50; i++) harness.miss();
		expect(harness.calls).toHaveLength(1);
		expect(harness.counted).toEqual({ subjectMisses: 51, subjectPulls: 1 });

		harness.miss("cus_1", "ent_1");
		expect(harness.calls).toHaveLength(2);
	});

	test("5.3 past the in-flight cap a miss is dropped, not held: a later miss pulls once a slot frees", async () => {
		const harness = createHarness();
		for (let i = 0; i <= MAX_PULLS_IN_FLIGHT; i++) harness.miss(`cus_${i}`);
		expect(harness.calls).toHaveLength(MAX_PULLS_IN_FLIGHT);

		await harness.calls[0]?.answer(NOT_HELD);
		harness.miss(`cus_${MAX_PULLS_IN_FLIGHT}`);
		expect(harness.calls.at(-1)?.customerId).toBe(`cus_${MAX_PULLS_IN_FLIGHT}`);
	});
});

describe("holds", () => {
	test("any answer holds the subject 30 s from its miss, then a miss pulls it again", async () => {
		const answers: [string, string | Error][] = [
			["cus_body", "{}"],
			["cus_missing", NOT_FOUND],
			["cus_off_worker", NOT_HELD],
			["cus_failed", WORKER_DOWN],
		];
		for (const [customerId, answer] of answers) {
			const harness = createHarness();
			harness.miss(customerId);
			await harness.calls[0]?.answer(answer);
			harness.advance(PULL_HOLD_MS - 1);
			harness.miss(customerId);
			expect(harness.calls).toHaveLength(1);
			harness.advance(1);
			harness.miss(customerId);
			expect(harness.calls).toHaveLength(2);
		}
	});

	test("(R11) only a body that is stored counts as a fill", async () => {
		let stores = true;
		const harness = createHarness({ applyPulled: async () => stores });
		harness.miss("cus_1");
		await harness.calls[0]?.answer("{}");
		expect(harness.applied).toEqual([{ customerId: "cus_1", body: "{}" }]);
		expect(harness.counted.subjectFills).toBe(1);

		stores = false;
		harness.miss("cus_2");
		await harness.calls[1]?.answer("{}");
		expect(harness.counted.subjectFills).toBe(1);
	});

	test("a token Autumn does not know holds the whole folder 30 s, and not another folder", async () => {
		const harness = createHarness();
		harness.miss("cus_1");
		await harness.calls[0]?.answer(ATOM_UNKNOWN);
		harness.miss("cus_2");
		expect(harness.calls).toHaveLength(1);

		const other = harness.subjectPulls.forFolder({
			tokenHash: () => "hash_other",
			applyPulled: async () => true,
		});
		other.request({ customerId: "cus_2", entityId: null });
		expect(harness.calls.at(-1)?.tokenHash).toBe("hash_other");

		harness.advance(PULL_HOLD_MS);
		harness.miss("cus_3");
		expect(harness.calls.at(-1)).toMatchObject({
			tokenHash: "hash_folder",
			customerId: "cus_3",
		});
	});

	test("(shadow) a folder whose token Autumn refuses: a distinct miss every second for 30 min is one pull per hold, never logged", async () => {
		const harness = createHarness();
		for (let i = 0; i < 30 * 60; i++) {
			const pullsBefore = harness.calls.length;
			harness.miss(`cus_${i}`);
			if (harness.calls.length > pullsBefore)
				await harness.calls.at(-1)?.answer(ATOM_UNKNOWN);
			harness.advance(1_000);
		}
		expect(harness.calls).toHaveLength((30 * MINUTE_MS) / PULL_HOLD_MS);
		expect(harness.warnings).toEqual([]);
	});
});

describe("failures", () => {
	test("Autumn having no subject for this Atom is expected, never logged", async () => {
		const harness = createHarness();
		harness.miss("cus_1");
		await harness.calls[0]?.answer(NOT_FOUND);
		harness.miss("cus_2");
		await harness.calls[1]?.answer(NOT_HELD);
		expect(harness.warnings).toEqual([]);
	});

	test("failures are logged at most once per hold", async () => {
		const harness = createHarness();
		for (let i = 0; i < 5; i++) {
			harness.miss(`cus_${i}`);
			await harness.calls.at(-1)?.answer(new Error("Autumn down"));
		}
		expect(harness.warnings).toHaveLength(1);

		harness.advance(PULL_HOLD_MS);
		harness.miss("cus_5");
		await harness.calls.at(-1)?.answer(WORKER_DOWN);
		expect(harness.warnings).toHaveLength(2);
		expect(harness.warnings[1]).toMatchObject({
			type: "atom_subject_pull_failed",
		});
	});

	test("a body that cannot be stored is logged, never thrown into the check", async () => {
		const harness = createHarness({
			applyPulled: async () => {
				throw new Error("not this customer's body");
			},
		});
		expect(() => harness.miss()).not.toThrow();
		await harness.calls[0]?.answer("{}");
		expect(harness.warnings).toHaveLength(1);
	});
});

test("5.14 once stopped, a pull in flight stores nothing and a miss pulls nothing", async () => {
	const harness = createHarness();
	harness.miss();
	harness.subjectPulls.stop();
	await harness.calls[0]?.answer("{}");
	harness.miss("cus_2");
	expect(harness.applied).toEqual([]);
	expect(harness.calls).toHaveLength(1);
	expect(harness.counted).toEqual({ subjectMisses: 2, subjectPulls: 1 });
});
