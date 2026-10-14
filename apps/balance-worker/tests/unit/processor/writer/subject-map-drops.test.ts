import { describe, expect, test } from "bun:test";
import { createSubjectMap } from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import { createSubjectMapBudget } from "../../../../src/processor/writer/subjectMap/createSubjectMapBudget.js";
import { createState } from "../../../fixtures/mutations.js";

const state = createState();
const stateBytes = JSON.stringify(state).length;

const noDrops = {
	capacity: 0,
	idle: 0,
	evict: 0,
	stale: 0,
	storeRejected: 0,
	coldStart: 0,
};

const write = ({
	map,
	subjectKey,
	customerKey = subjectKey,
}: {
	map: ReturnType<typeof createSubjectMap>;
	subjectKey: string;
	customerKey?: string;
}) => map.setState({ subjectKey, customerKey, state });

describe("subject map drops", () => {
	test("a fresh map holds nothing and has dropped nothing", () => {
		expect(createSubjectMap().readUsage()).toEqual({
			residentSubjects: 0,
			residentBytes: 0,
			droppedSubjects: noDrops,
		});
	});

	test("a write past the byte bound counts the subjects it pushes out as capacity", () => {
		const map = createSubjectMap({ maxBytes: stateBytes * 2 });
		write({ map, subjectKey: "a" });
		write({ map, subjectKey: "b" });
		write({ map, subjectKey: "c" });
		write({ map, subjectKey: "d" });

		expect(map.readUsage()).toEqual({
			residentSubjects: 2,
			residentBytes: stateBytes * 2,
			droppedSubjects: { ...noDrops, capacity: 2 },
		});
	});

	test("another partition filling the worker's budget makes this one drop for capacity", () => {
		const budget = createSubjectMapBudget({ totalBytes: stateBytes * 4 });
		const map = createSubjectMap({ maxBytes: () => member.maxBytes() });
		const member = budget.join({ sizeBytes: () => map.sizeBytes() });
		let heldByPeer = 0;
		budget.join({ sizeBytes: () => heldByPeer });
		write({ map, subjectKey: "a" });
		write({ map, subjectKey: "b" });
		write({ map, subjectKey: "c" });
		expect(map.readUsage().droppedSubjects).toEqual(noDrops);

		heldByPeer = stateBytes * 2;
		write({ map, subjectKey: "d" });

		expect(map.readUsage()).toEqual({
			residentSubjects: 2,
			residentBytes: stateBytes * 2,
			droppedSubjects: { ...noDrops, capacity: 2 },
		});
	});

	test("an idle sweep counts as idle, not capacity", () => {
		let at = 0;
		const map = createSubjectMap({ idleExpiryMs: 1_000, now: () => at });
		write({ map, subjectKey: "a" });
		write({ map, subjectKey: "b" });
		at += 1_001;
		write({ map, subjectKey: "c" });

		expect(map.readUsage()).toEqual({
			residentSubjects: 1,
			residentBytes: stateBytes,
			droppedSubjects: { ...noDrops, idle: 2 },
		});
	});

	test("an explicit evict counts each of the customer's subjects, entities included, under its reason", () => {
		const map = createSubjectMap();
		write({ map, subjectKey: "cus_a", customerKey: "cus_a" });
		write({ map, subjectKey: "cus_a:ent_1", customerKey: "cus_a" });
		write({ map, subjectKey: "cus_b", customerKey: "cus_b" });
		write({ map, subjectKey: "cus_c", customerKey: "cus_c" });

		map.evictCustomer({ customerKey: "cus_a", reason: "evict" });
		map.evictCustomer({ customerKey: "cus_b", reason: "stale" });
		map.evictCustomer({ customerKey: "cus_c", reason: "storeRejected" });
		map.evictCustomer({ customerKey: "cus_absent", reason: "evict" });

		expect(map.readUsage()).toEqual({
			residentSubjects: 0,
			residentBytes: 0,
			droppedSubjects: { ...noDrops, evict: 2, stale: 1, storeRejected: 1 },
		});
	});

	test("a pinned subject leaves the resident count when the evict hides it, and is counted once its last pin goes", () => {
		const map = createSubjectMap();
		write({ map, subjectKey: "cus_a" });
		map.pin({ subjectKey: "cus_a" });
		map.pin({ subjectKey: "cus_a" });

		map.evictCustomer({ customerKey: "cus_a", reason: "storeRejected" });
		map.evictCustomer({ customerKey: "cus_a", reason: "evict" });
		expect(map.readUsage()).toEqual({
			residentSubjects: 0,
			residentBytes: 0,
			droppedSubjects: noDrops,
		});

		map.unpin({ subjectKey: "cus_a" });
		expect(map.readUsage().droppedSubjects).toEqual(noDrops);
		map.unpin({ subjectKey: "cus_a" });
		expect(map.readUsage().droppedSubjects).toEqual({
			...noDrops,
			storeRejected: 1,
		});
	});

	test("a hidden subject written again is resident again until the evict drops it", () => {
		const map = createSubjectMap();
		write({ map, subjectKey: "cus_a" });
		map.hideCustomer({ customerKey: "cus_a" });
		expect(map.readUsage().residentSubjects).toBe(0);

		write({ map, subjectKey: "cus_a" });
		expect(map.readUsage().residentSubjects).toBe(1);

		map.evictCustomer({ customerKey: "cus_a", reason: "evict" });
		expect(map.readUsage()).toEqual({
			residentSubjects: 0,
			residentBytes: 0,
			droppedSubjects: { ...noDrops, evict: 1 },
		});
	});

	test("a subject hidden by an evict waiting for the store is never swept for capacity; the evict counts it", () => {
		const map = createSubjectMap({ maxBytes: stateBytes });
		write({ map, subjectKey: "cus_a" });
		map.hideCustomer({ customerKey: "cus_a" });
		write({ map, subjectKey: "cus_b" });
		write({ map, subjectKey: "cus_c" });

		expect(map.isEvicting({ customerKey: "cus_a" })).toBe(true);
		expect(map.readUsage().droppedSubjects).toEqual({
			...noDrops,
			capacity: 1,
		});

		map.evictCustomer({ customerKey: "cus_a", reason: "evict" });
		expect(map.readUsage()).toEqual({
			residentSubjects: 1,
			residentBytes: stateBytes,
			droppedSubjects: { ...noDrops, capacity: 1, evict: 1 },
		});
	});

	test("a subject hidden by an evict waiting for the store is never swept as idle; the evict counts it", () => {
		let at = 0;
		const map = createSubjectMap({ idleExpiryMs: 1_000, now: () => at });
		write({ map, subjectKey: "cus_a" });
		map.hideCustomer({ customerKey: "cus_a" });
		at += 1_001;
		write({ map, subjectKey: "cus_b" });

		expect(map.isEvicting({ customerKey: "cus_a" })).toBe(true);
		expect(map.readUsage().droppedSubjects).toEqual(noDrops);

		map.evictCustomer({ customerKey: "cus_a", reason: "stale" });
		expect(map.readUsage().droppedSubjects).toEqual({ ...noDrops, stale: 1 });
	});

	test("a cold start counts what it drops and nothing it spares or finds pinned", () => {
		const map = createSubjectMap();
		write({ map, subjectKey: "dropped" });
		write({ map, subjectKey: "spared" });
		write({ map, subjectKey: "pinned" });
		map.pin({ subjectKey: "pinned" });

		map.dropResident({ drops: ({ customerKey }) => customerKey !== "spared" });

		expect(map.readUsage()).toEqual({
			residentSubjects: 2,
			residentBytes: stateBytes * 2,
			droppedSubjects: { ...noDrops, coldStart: 1 },
		});
	});

	test("a pin-only placeholder is never counted as a dropped subject", () => {
		const map = createSubjectMap({ maxBytes: stateBytes });
		map.pin({ subjectKey: "placeholder" });
		map.unpin({ subjectKey: "placeholder" });
		write({ map, subjectKey: "a" });
		write({ map, subjectKey: "b" });

		expect(map.readUsage()).toEqual({
			residentSubjects: 1,
			residentBytes: stateBytes,
			droppedSubjects: { ...noDrops, capacity: 1 },
		});
	});

	test("rewriting a resident subject neither adds a resident subject nor drops one", () => {
		const map = createSubjectMap();
		write({ map, subjectKey: "a" });
		map.setState({
			subjectKey: "a",
			customerKey: "a",
			state: createState({ balance: 99 }),
		});

		expect(map.readUsage().residentSubjects).toBe(1);
		expect(map.readUsage().droppedSubjects).toEqual(noDrops);
	});

	test("the usage read is a copy: a caller holding it sees later drops only on its next read", () => {
		const map = createSubjectMap();
		write({ map, subjectKey: "a" });
		const before = map.readUsage();

		map.evictCustomer({ customerKey: "a", reason: "evict" });

		expect(before.droppedSubjects.evict).toBe(0);
		expect(map.readUsage().droppedSubjects.evict).toBe(1);
	});
});
