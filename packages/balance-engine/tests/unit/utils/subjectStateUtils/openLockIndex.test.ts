import { describe, expect, test } from "bun:test";
import type { OpenLock } from "../../../../src/models/subject/rows/workerLock.js";
import {
	findOpenLockById,
	findOpenLockByLockId,
	OPEN_LOCK_INDEX_FROM,
	withOpenLock,
	withoutOpenLock,
} from "../../../../src/utils/subjectStateUtils/openLockIndex.js";

/** What the engine did before the index: a scan for each question, a spread for an insert, a filter for a delete. */
const scan = {
	byId: (openLocks: readonly OpenLock[], id: string) =>
		openLocks.find((openLock) => openLock.id === id) ?? null,
	byLockId: (openLocks: readonly OpenLock[], lockId: string) =>
		openLocks.find((openLock) => openLock.lock_id === lockId) ?? null,
	with: (openLocks: readonly OpenLock[], openLock: OpenLock) => [
		...openLocks,
		openLock,
	],
	without: (openLocks: readonly OpenLock[], id: string) => {
		const remaining = openLocks.filter((openLock) => openLock.id !== id);
		return remaining.length === openLocks.length ? null : remaining;
	},
};

/** mulberry32: the same sequence on every run. */
const seeded = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const lockN = (n: number): OpenLock => ({ id: `lck_${n}`, lock_id: `L${n}` });

const driveBoth = ({ steps, seed }: { steps: number; seed: number }) => {
	const random = seeded(seed);
	let indexed: readonly OpenLock[] = [];
	let plain: readonly OpenLock[] = [];
	let next = 0;
	for (let step = 0; step < steps; step++) {
		const roll = random();
		if (roll < 0.55 || plain.length === 0) {
			const openLock = lockN(next++);
			indexed = withOpenLock({ openLocks: indexed, openLock });
			plain = scan.with(plain, openLock);
		} else if (roll < 0.9) {
			const victim = plain[Math.floor(random() * plain.length)];
			const removed = withoutOpenLock({ openLocks: indexed, id: victim.id });
			const expected = scan.without(plain, victim.id);
			expect(removed).toEqual(expected);
			if (removed && expected) {
				indexed = removed;
				plain = expected;
			}
		} else {
			expect(
				withoutOpenLock({ openLocks: indexed, id: `lck_${next + 1}` }),
			).toBeNull();
		}
		expect(indexed).toEqual(plain);
		const probe = Math.floor(random() * (next + 2));
		expect(findOpenLockById({ openLocks: indexed, id: `lck_${probe}` })).toBe(
			scan.byId(plain, `lck_${probe}`),
		);
		expect(
			findOpenLockByLockId({ openLocks: indexed, lockId: `L${probe}` }),
		).toBe(scan.byLockId(plain, `L${probe}`));
	}
	return plain.length;
};

describe("the open-lock index answers as a scan does", () => {
	test("below the threshold, where it scans", () => {
		expect(driveBoth({ steps: 400, seed: 1 })).toBeLessThan(
			OPEN_LOCK_INDEX_FROM,
		);
	});

	test("across the threshold and far past it, with inserts, deletes, misses and repeats", () => {
		expect(driveBoth({ steps: 12_000, seed: 2 })).toBeGreaterThan(
			OPEN_LOCK_INDEX_FROM * 4,
		);
	});

	test("an array nobody built through the index is indexed on its first question", () => {
		const openLocks = Array.from({ length: OPEN_LOCK_INDEX_FROM * 3 }, (_, n) =>
			lockN(n),
		);
		expect(findOpenLockByLockId({ openLocks, lockId: "L500" })).toBe(
			openLocks[500],
		);
		expect(findOpenLockById({ openLocks, id: "lck_0" })).toBe(openLocks[0]);
		expect(findOpenLockById({ openLocks, id: "lck_9999" })).toBeNull();
		const smaller = withoutOpenLock({ openLocks, id: "lck_500" });
		expect(smaller).toEqual(scan.without(openLocks, "lck_500"));
		expect(
			findOpenLockByLockId({ openLocks: smaller ?? [], lockId: "L500" }),
		).toBeNull();
		expect(
			findOpenLockByLockId({ openLocks: smaller ?? [], lockId: "L501" }),
		).toBe(openLocks[501]);
	});

	test("an insert keeps order and never touches the array it was given", () => {
		const openLocks = Array.from({ length: OPEN_LOCK_INDEX_FROM }, (_, n) =>
			lockN(n),
		);
		const before = JSON.stringify(openLocks);
		const grown = withOpenLock({ openLocks, openLock: lockN(1_000) });
		expect(JSON.stringify(openLocks)).toBe(before);
		expect(grown).toEqual([...openLocks, lockN(1_000)]);
		expect(findOpenLockById({ openLocks, id: "lck_1000" })).toBeNull();
		expect(findOpenLockById({ openLocks: grown, id: "lck_1000" })).toEqual(
			lockN(1_000),
		);
	});
});
