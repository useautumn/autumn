import { describe, expect, test } from "bun:test";
import { readContainerMemoryBytes } from "../../../../src/init/containerMemory.js";
import { createSubjectMap } from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import {
	createSubjectMapBudget,
	SUBJECT_MAP_FALLBACK_BUDGET_BYTES,
	subjectMapBudgetBytesOf,
} from "../../../../src/processor/writer/subjectMap/createSubjectMapBudget.js";
import { createState } from "../../../fixtures/mutations.js";

const gib = 1024 * 1024 * 1024;

describe("subject map budget", () => {
	test("the worker-wide budget is a share of container memory, a fixed override, or the fallback when memory is unknown", () => {
		expect(
			subjectMapBudgetBytesOf({
				containerMemoryBytes: 8 * gib,
				memoryFraction: 0.1,
			}),
		).toBe(Math.floor(0.8 * gib));
		expect(
			subjectMapBudgetBytesOf({
				containerMemoryBytes: 8 * gib,
				memoryFraction: 0.1,
				overrideBytes: 123_456_789,
			}),
		).toBe(123_456_789);
		expect(
			subjectMapBudgetBytesOf({
				containerMemoryBytes: null,
				memoryFraction: 0.1,
			}),
		).toBe(SUBJECT_MAP_FALLBACK_BUDGET_BYTES);
	});

	test("container memory comes from the cgroup limit when one is set, bounded by the host, else the host's total", () => {
		const files = new Map<string, string>();
		const readFile = ({ path }: { path: string }) => files.get(path) ?? null;
		const totalMemory = () => 16 * gib;

		files.set("/sys/fs/cgroup/memory.max", `${8 * gib}\n`);
		expect(readContainerMemoryBytes({ readFile, totalMemory })).toBe(8 * gib);

		files.set("/sys/fs/cgroup/memory.max", "max\n");
		files.set("/sys/fs/cgroup/memory/memory.limit_in_bytes", `${4 * gib}\n`);
		expect(readContainerMemoryBytes({ readFile, totalMemory })).toBe(4 * gib);

		files.set(
			"/sys/fs/cgroup/memory/memory.limit_in_bytes",
			"9223372036854771712\n",
		);
		expect(readContainerMemoryBytes({ readFile, totalMemory })).toBe(16 * gib);

		files.clear();
		expect(readContainerMemoryBytes({ readFile, totalMemory })).toBe(16 * gib);
	});

	test("partitions share the budget equally as they join and leave; leaving twice changes nothing", () => {
		const budget = createSubjectMapBudget({ totalBytes: 1_000 });
		const first = budget.join();
		expect(first.maxBytes()).toBe(1_000);
		const second = budget.join();
		expect(first.maxBytes()).toBe(500);
		expect(second.maxBytes()).toBe(500);
		second.leave();
		second.leave();
		expect(budget.members()).toBe(1);
		expect(first.maxBytes()).toBe(1_000);
	});

	test("a map bound by its share re-reads it: another partition joining shrinks the share and the next write evicts", () => {
		const state = createState();
		const bytes = JSON.stringify(state).length;
		const budget = createSubjectMapBudget({ totalBytes: bytes * 4 });
		const member = budget.join();
		const map = createSubjectMap({ maxBytes: () => member.maxBytes() });
		map.setState({ subjectKey: "a", customerKey: "a", state });
		map.setState({ subjectKey: "b", customerKey: "b", state });
		map.setState({ subjectKey: "c", customerKey: "c", state });
		expect(map.readState({ subjectKey: "a" })).toEqual(state);

		budget.join();
		map.setState({ subjectKey: "d", customerKey: "d", state });
		expect(map.readState({ subjectKey: "b" })).toBeNull();
		expect(map.readState({ subjectKey: "c" })).toBeNull();
		expect(map.readState({ subjectKey: "a" })).toEqual(state);
		expect(map.readState({ subjectKey: "d" })).toEqual(state);
		expect(map.sizeBytes()).toBeLessThanOrEqual(member.maxBytes());
	});
});
