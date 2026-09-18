import { expect, test } from "bun:test";
import {
	isRunDisabled,
	runButtonLabel,
	statusLabel,
	waitingExplanation,
} from "./migrationStatus";

test("run button reads Run All until a Run All has executed", () => {
	expect(runButtonLabel("draft")).toBe("Run All");
	expect(runButtonLabel("running")).toBe("Run All");
	expect(runButtonLabel("waiting")).toBe("Run All");
	expect(runButtonLabel("run")).toBe("Run again");
});

test("run button is disabled while a Run All is queued or executing", () => {
	expect(isRunDisabled("running")).toBe(true);
	expect(isRunDisabled("waiting")).toBe(true);
	expect(isRunDisabled("draft")).toBe(false);
	expect(isRunDisabled("run")).toBe(false);
});

test("status label names the blocking migration while waiting", () => {
	expect(statusLabel({ status: "waiting", blockedBy: "pro-v3" })).toBe(
		"Waiting on pro-v3",
	);
	expect(statusLabel({ status: "waiting", blockedBy: null })).toBe("Waiting");
	expect(statusLabel({ status: "draft", blockedBy: null })).toBe("Draft");
	expect(statusLabel({ status: "running", blockedBy: null })).toBe("Running");
	expect(statusLabel({ status: "run", blockedBy: null })).toBe("Run");
});

test("a migration whose last run changed nothing says so", () => {
	expect(statusLabel({ status: "no_changes", blockedBy: null })).toBe(
		"No changes",
	);
});

test("a failed or canceled run is named, not shown as a success", () => {
	expect(statusLabel({ status: "failed", blockedBy: null })).toBe("Failed");
	expect(statusLabel({ status: "canceled", blockedBy: null })).toBe("Canceled");
});

test("a no-op run can be run again and does not disable the button", () => {
	expect(runButtonLabel("no_changes")).toBe("Run again");
	expect(isRunDisabled("no_changes")).toBe(false);
});

test("waiting explanation names the one-per-org limit and the blocker", () => {
	expect(waitingExplanation("pro-v3")).toBe(
		'Only one migration runs at a time per organization. This one starts once "pro-v3" finishes.',
	);
	expect(waitingExplanation(null)).toContain("the current run");
});
