import { describe, expect, test } from "bun:test";
import { createSubjectState } from "@autumn/balance-engine";
import {
	createHeldSubjects,
	HELD_IDLE_SCAN_PER_HOLD,
} from "../../../src/state/heldSubjects/createHeldSubjects.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import { atomOrg } from "../utils/atomFixtures.js";

const subjectOf = (customerId: string): StoredSubject => ({
	state: createSubjectState({
		identity: { orgId: "org_1", env: "sandbox", customerId, entityId: null },
	}),
	catalog: {} as StoredSubject["catalog"],
	org: atomOrg,
	logOffset: 1n,
	readAt: 1,
	customerVersion: 0n,
});

const hold = (
	held: ReturnType<typeof createHeldSubjects>,
	key: string,
	bytes: number,
) => held.hold({ key, subject: subjectOf(key), bytes, sliceHash: "slice" });

describe("held subjects", () => {
	test("past the byte budget, the least recently read subjects are dropped until it fits", () => {
		const held = createHeldSubjects({ budgetBytes: 100 });
		hold(held, "a", 40);
		hold(held, "b", 40);
		held.get("a");

		hold(held, "c", 40);

		expect(held.get("b")).toBeUndefined();
		expect(held.get("a")?.subject.state.identity.customerId).toBe("a");
		expect(held.get("c")?.subject.state.identity.customerId).toBe("c");
		expect(held.bytes).toBe(80);
	});

	test("holding a subject again replaces its bytes; one larger than the budget is still held alone", () => {
		const held = createHeldSubjects({ budgetBytes: 100 });
		hold(held, "a", 40);
		hold(held, "a", 60);
		expect(held.bytes).toBe(60);

		hold(held, "big", 150);

		expect(held.get("a")).toBeUndefined();
		expect(held.get("big")).toBeDefined();
		expect(held.bytes).toBe(150);
	});

	test("a closing store's subjects are dropped by their prefix", () => {
		const held = createHeldSubjects({ budgetBytes: 100 });
		hold(held, "1\u0000a", 10);
		hold(held, "2\u0000a", 10);

		held.dropPrefix("1\u0000");

		expect(held.get("1\u0000a")).toBeUndefined();
		expect(held.get("2\u0000a")).toBeDefined();
		expect(held.bytes).toBe(10);
	});

	test("counts what the budget evicted", () => {
		const held = createHeldSubjects({ budgetBytes: 100 });
		hold(held, "a", 60);
		hold(held, "b", 60);
		hold(held, "c", 60);

		expect(held.evicted).toBe(2);
		expect(held.expired).toBe(0);
	});
});

describe("held subjects idle expiry", () => {
	const HOUR = 3_600_000;
	const withClock = () => {
		let at = 0;
		const held = createHeldSubjects({
			budgetBytes: 1_000_000,
			idleExpiryMs: 4 * HOUR,
			now: () => at,
		});
		return { held, advance: (ms: number) => (at += ms) };
	};

	test("a hold drops subjects nobody has read or written for longer than the idle expiry", () => {
		const { held, advance } = withClock();
		hold(held, "idle", 10);
		advance(4 * HOUR + 1);

		hold(held, "fresh", 10);

		expect(held.get("idle")).toBeUndefined();
		expect(held.get("fresh")).toBeDefined();
		expect(held.bytes).toBe(10);
		expect(held.expired).toBe(1);
		expect(held.evicted).toBe(0);
	});

	test("a subject idle for exactly the expiry stays", () => {
		const { held, advance } = withClock();
		hold(held, "a", 10);
		advance(4 * HOUR);

		hold(held, "b", 10);

		expect(held.get("a")).toBeDefined();
	});

	test("a read keeps a subject resident", () => {
		const { held, advance } = withClock();
		hold(held, "read", 10);
		hold(held, "unread", 10);
		advance(3 * HOUR);
		held.get("read");
		advance(2 * HOUR);

		hold(held, "c", 10);

		expect(held.get("read")).toBeDefined();
		expect(held.get("unread")).toBeUndefined();
	});

	test("one hold drops a bounded number of idle subjects, and later holds drop the rest", () => {
		const { held, advance } = withClock();
		for (let i = 0; i < HELD_IDLE_SCAN_PER_HOLD + 5; i++)
			hold(held, `s${i}`, 1);
		advance(5 * HOUR);

		hold(held, "fresh", 1);
		expect(held.size).toBe(6);

		hold(held, "fresher", 1);
		expect(held.size).toBe(2);
	});

	test("the stats tick expires idle subjects without a write", () => {
		const { held, advance } = withClock();
		hold(held, "a", 10);
		advance(5 * HOUR);

		held.expireIdle();

		expect(held.size).toBe(0);
		expect(held.expired).toBe(1);
	});

	test("without an idle expiry a subject stays however long it sits", () => {
		let at = 0;
		const held = createHeldSubjects({ budgetBytes: 100, now: () => at });
		hold(held, "a", 10);
		at = Number.MAX_SAFE_INTEGER;

		hold(held, "b", 10);
		held.expireIdle();

		expect(held.get("a")).toBeDefined();
	});
});
