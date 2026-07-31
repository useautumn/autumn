import { beforeEach, describe, expect, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import {
	_resetSubjectReadL1ForTesting,
	_subjectReadInFlightSizeForTesting,
	_subjectReadL1SizeForTesting,
	coalescedSubjectRead,
} from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";

const makeSubject = (id: string): FullSubject =>
	({ customer: { id } }) as unknown as FullSubject;

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

const makeCountingFetch = (subject: FullSubject) => {
	const state = { calls: 0 };
	const fetch = () => {
		state.calls++;
		return Promise.resolve(subject);
	};
	return { state, fetch };
};

describe("coalescedSubjectRead", () => {
	beforeEach(() => {
		_resetSubjectReadL1ForTesting();
	});

	test("two concurrent calls for the same key share one fetch and one object", async () => {
		const subject = makeSubject("cus_1");
		const flight = deferred<FullSubject>();
		let calls = 0;
		const fetch = () => {
			calls++;
			return flight.promise;
		};

		const p1 = coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch });
		const p2 = coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch });

		expect(_subjectReadInFlightSizeForTesting()).toBe(1);

		flight.resolve(subject);
		const [r1, r2] = await Promise.all([p1, p2]);

		expect(calls).toBe(1);
		expect(r1).toBe(subject);
		expect(r2).toBe(subject);
	});

	test("l1TtlMs=0 is a pure passthrough: no coalescing, no caching", async () => {
		const subject = makeSubject("cus_1");
		const flight = deferred<FullSubject>();
		let calls = 0;
		const fetch = () => {
			calls++;
			return flight.promise;
		};

		const p1 = coalescedSubjectRead({ key: "k1", l1TtlMs: 0, fetch });
		const p2 = coalescedSubjectRead({ key: "k1", l1TtlMs: 0, fetch });

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);

		flight.resolve(subject);
		await Promise.all([p1, p2]);

		expect(calls).toBe(2);
		expect(_subjectReadL1SizeForTesting()).toBe(0);

		await coalescedSubjectRead({ key: "k1", l1TtlMs: 0, fetch });
		expect(calls).toBe(3);
	});

	test("L1 hit within TTL serves without fetching; expiry refetches", async () => {
		const subject = makeSubject("cus_1");
		const { state, fetch } = makeCountingFetch(subject);

		const first = await coalescedSubjectRead({ key: "k1", l1TtlMs: 50, fetch });
		expect(state.calls).toBe(1);

		const second = await coalescedSubjectRead({
			key: "k1",
			l1TtlMs: 50,
			fetch,
		});
		expect(state.calls).toBe(1);
		expect(second).toBe(first);

		await Bun.sleep(80);

		await coalescedSubjectRead({ key: "k1", l1TtlMs: 50, fetch });
		expect(state.calls).toBe(2);
	});

	test("rejected fetch is not cached and the next call refetches", async () => {
		const subject = makeSubject("cus_1");
		let calls = 0;
		const fetch = () => {
			calls++;
			if (calls === 1) return Promise.reject(new Error("db down"));
			return Promise.resolve(subject);
		};

		await expect(
			coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch }),
		).rejects.toThrow("db down");
		await Bun.sleep(0);

		expect(_subjectReadL1SizeForTesting()).toBe(0);
		expect(_subjectReadInFlightSizeForTesting()).toBe(0);

		const result = await coalescedSubjectRead({
			key: "k1",
			l1TtlMs: 1000,
			fetch,
		});
		expect(result).toBe(subject);
		expect(calls).toBe(2);
	});

	test("concurrent callers of a failing flight all reject, then recover", async () => {
		const flight = deferred<FullSubject>();
		let calls = 0;
		const fetch = () => {
			calls++;
			return flight.promise;
		};

		const p1 = coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch });
		const p2 = coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch });

		// allSettled attaches handlers before the reject, avoiding both the
		// unhandled-rejection window and bun's expect().rejects pending-drain.
		const results = Promise.allSettled([p1, p2]);
		flight.reject(new Error("redis down"));
		const [r1, r2] = await results;

		expect(r1.status).toBe("rejected");
		expect(r2.status).toBe("rejected");
		if (r1.status === "rejected") {
			expect((r1.reason as Error).message).toBe("redis down");
		}
		await Bun.sleep(0);

		expect(calls).toBe(1);
		expect(_subjectReadInFlightSizeForTesting()).toBe(0);
	});

	test("different keys do not coalesce", async () => {
		const flightA = deferred<FullSubject>();
		const flightB = deferred<FullSubject>();
		const flights = [flightA, flightB];
		let calls = 0;
		const fetch = () => {
			const flight = flights[calls];
			calls++;
			return flight.promise;
		};

		const p1 = coalescedSubjectRead({ key: "kA", l1TtlMs: 1000, fetch });
		const p2 = coalescedSubjectRead({ key: "kB", l1TtlMs: 1000, fetch });

		expect(calls).toBe(2);
		expect(_subjectReadInFlightSizeForTesting()).toBe(2);

		flightA.resolve(makeSubject("cus_a"));
		flightB.resolve(makeSubject("cus_b"));
		const [rA, rB] = await Promise.all([p1, p2]);

		expect(rA).not.toBe(rB);
	});

	test("in-flight entry is removed once the flight settles", async () => {
		const subject = makeSubject("cus_1");
		const { fetch } = makeCountingFetch(subject);

		await coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch });

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);
		expect(_subjectReadL1SizeForTesting()).toBe(1);
	});

	test("a synchronously-throwing fetch does not poison the in-flight map", async () => {
		const subject = makeSubject("cus_1");
		let calls = 0;
		const fetch = (): Promise<FullSubject> => {
			calls++;
			if (calls === 1) throw new Error("sync boom");
			return Promise.resolve(subject);
		};

		await expect(
			coalescedSubjectRead({ key: "k1", l1TtlMs: 1000, fetch }),
		).rejects.toThrow("sync boom");
		await Bun.sleep(0);

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);

		const result = await coalescedSubjectRead({
			key: "k1",
			l1TtlMs: 1000,
			fetch,
		});
		expect(result).toBe(subject);
	});

	test("oversized subjects get singleflight but are never cached", async () => {
		const giant = {
			customer: { id: "cus_giant" },
			customer_products: new Array(10_001),
			extra_customer_entitlements: [],
		} as unknown as FullSubject;
		const { state, fetch } = makeCountingFetch(giant);

		const [a, b] = await Promise.all([
			coalescedSubjectRead({ key: "giant", l1TtlMs: 1000, fetch }),
			coalescedSubjectRead({ key: "giant", l1TtlMs: 1000, fetch }),
		]);

		expect(state.calls).toBe(1);
		expect(a).toBe(b);
		expect(_subjectReadL1SizeForTesting()).toBe(0);

		await coalescedSubjectRead({ key: "giant", l1TtlMs: 1000, fetch });
		expect(state.calls).toBe(2);
	});
});
