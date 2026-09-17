import { expect, test } from "bun:test";
import { EXECUTION_STATUS_VALUES } from "./ExecutionStatusSubMenu";
import {
	executionStatusesForSource,
	previewSourceForStatus,
} from "./previewSource";

test("draft migrations preview the live filter", () => {
	expect(previewSourceForStatus("draft")).toBe("filter");
});

test("a queued or executing run keeps the live filter in view", () => {
	expect(previewSourceForStatus("waiting")).toBe("filter");
	expect(previewSourceForStatus("running")).toBe("filter");
});

test("once a Run All has completed the list freezes to item runs", () => {
	expect(previewSourceForStatus("run")).toBe("item_runs");
});

test("a run that changed nothing still froze its customer list", () => {
	expect(previewSourceForStatus("no_changes")).toBe("item_runs");
});

test("item_runs source drops the filter-only statuses from options and selections", () => {
	expect(
		executionStatusesForSource("item_runs", EXECUTION_STATUS_VALUES),
	).toEqual(["running", "succeeded", "skipped", "failed"]);
	expect(
		executionStatusesForSource("item_runs", ["not_run", "queued", "skipped"]),
	).toEqual(["skipped"]);
	expect(executionStatusesForSource("filter", EXECUTION_STATUS_VALUES)).toEqual(
		[...EXECUTION_STATUS_VALUES],
	);
});
