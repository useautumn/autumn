import { expect, test } from "bun:test";
import { EXECUTION_STATUS_VALUES } from "./ExecutionStatusSubMenu";
import {
	executionStatusOptionsForSource,
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

test("item_runs source drops the filter-only status options", () => {
	expect(
		executionStatusOptionsForSource("item_runs", EXECUTION_STATUS_VALUES),
	).toEqual(["running", "succeeded", "skipped", "failed"]);
	expect(
		executionStatusOptionsForSource("filter", EXECUTION_STATUS_VALUES),
	).toEqual([...EXECUTION_STATUS_VALUES]);
});
