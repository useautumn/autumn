import { beforeEach, describe, expect, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import {
	_resetSubjectReadInFlightForTesting,
	_subjectReadInFlightSizeForTesting,
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
		_resetSubjectReadInFlightForTesting();
	});

	test("two concurrent calls for the same key share one fetch and one object", async () => {
		const subject = makeSubject("cus_1");
		const flight = deferred<FullSubject>();
		let calls = 0;
		const fetch = () => {
			calls++;
			return flight.promise;
		};

		const p1 = coalescedSubjectRead({ key: "k1", singleflight: true, fetch });
		const p2 = coalescedSubjectRead({ key: "k1", singleflight: true, fetch });

		expect(_subjectReadInFlightSizeForTesting()).toBe(1);

		flight.resolve(subject);
		const [r1, r2] = await Promise.all([p1, p2]);

		expect(calls).toBe(1);
		expect(r1).toBe(subject);
		expect(r2).toBe(subject);
	});

	test("singleflight=false is a pure passthrough", async () => {
		const subject = makeSubject("cus_1");
		const flight = deferred<FullSubject>();
		let calls = 0;
		const fetch = () => {
			calls++;
			return flight.promise;
		};

		const p1 = coalescedSubjectRead({ key: "k1", singleflight: false, fetch });
		const p2 = coalescedSubjectRead({ key: "k1", singleflight: false, fetch });

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);

		flight.resolve(subject);
		await Promise.all([p1, p2]);

		expect(calls).toBe(2);

		await coalescedSubjectRead({ key: "k1", singleflight: false, fetch });
		expect(calls).toBe(3);
	});

	test("concurrent calls share one fetch, sequential calls always refetch", async () => {
		const subject = makeSubject("cus_1");
		const { state, fetch } = makeCountingFetch(subject);

		const [a, b] = await Promise.all([
			coalescedSubjectRead({ key: "k1", singleflight: true, fetch }),
			coalescedSubjectRead({ key: "k1", singleflight: true, fetch }),
		]);

		expect(state.calls).toBe(1);
		expect(a).toBe(b);

		await coalescedSubjectRead({ key: "k1", singleflight: true, fetch });
		expect(state.calls).toBe(2);
	});

	test("rejected fetch is not retained and the next call refetches", async () => {
		const subject = makeSubject("cus_1");
		let calls = 0;
		const fetch = () => {
			calls++;
			if (calls === 1) return Promise.reject(new Error("db down"));
			return Promise.resolve(subject);
		};

		await expect(
			coalescedSubjectRead({ key: "k1", singleflight: true, fetch }),
		).rejects.toThrow("db down");
		await Bun.sleep(0);

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);

		const result = await coalescedSubjectRead({
			key: "k1",
			singleflight: true,
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

		const p1 = coalescedSubjectRead({ key: "k1", singleflight: true, fetch });
		const p2 = coalescedSubjectRead({ key: "k1", singleflight: true, fetch });

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

		const p1 = coalescedSubjectRead({ key: "kA", singleflight: true, fetch });
		const p2 = coalescedSubjectRead({ key: "kB", singleflight: true, fetch });

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

		await coalescedSubjectRead({ key: "k1", singleflight: true, fetch });

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);
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
			coalescedSubjectRead({ key: "k1", singleflight: true, fetch }),
		).rejects.toThrow("sync boom");
		await Bun.sleep(0);

		expect(_subjectReadInFlightSizeForTesting()).toBe(0);

		const result = await coalescedSubjectRead({
			key: "k1",
			singleflight: true,
			fetch,
		});
		expect(result).toBe(subject);
	});
});
