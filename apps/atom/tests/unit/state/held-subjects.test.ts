import { describe, expect, test } from "bun:test";
import { createSubjectState } from "@autumn/balance-engine";
import { createHeldSubjects } from "../../../src/state/heldSubjects/createHeldSubjects.js";
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
});

const hold = (
	held: ReturnType<typeof createHeldSubjects>,
	key: string,
	bytes: number,
) => held.hold({ key, subject: subjectOf(key), bytes });

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
});
