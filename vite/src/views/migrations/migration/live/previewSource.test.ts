import { expect, test } from "bun:test";
import { EXECUTION_STATUS_VALUES } from "./ExecutionStatusSubMenu";
import {
	executionStatusesForSource,
	previewSourceForStatus,
} from "./previewSource";

test("draft migrations preview the live filter", () => {
	expect(previewSourceForStatus("draft")).toBe("filter");
});

test("once a Run All has started the list freezes to item runs", () => {
	expect(previewSourceForStatus("running")).toBe("item_runs");
	expect(previewSourceForStatus("waiting")).toBe("item_runs");
	expect(previewSourceForStatus("run")).toBe("item_runs");
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
