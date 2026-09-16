import { expect, test } from "bun:test";
import {
	isRunDisabled,
	runButtonLabel,
	statusBadge,
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

test("status badge names the blocking migration while waiting", () => {
	expect(statusBadge({ status: "waiting", blockedBy: "pro-v3" })).toEqual({
		label: "Waiting on pro-v3",
		tone: "waiting",
	});
	expect(statusBadge({ status: "waiting", blockedBy: null }).label).toBe(
		"Waiting",
	);
});

test("status badge tones", () => {
	expect(statusBadge({ status: "draft", blockedBy: null })).toEqual({
		label: "Draft",
		tone: "draft",
	});
	expect(statusBadge({ status: "running", blockedBy: null })).toEqual({
		label: "Running",
		tone: "running",
	});
	expect(statusBadge({ status: "run", blockedBy: null })).toEqual({
		label: "Run",
		tone: "run",
	});
});

test("waiting explanation names the one-per-org limit and the blocker", () => {
	expect(waitingExplanation("pro-v3")).toBe(
		'Only one migration runs at a time per organization. This one starts once "pro-v3" finishes.',
	);
	expect(waitingExplanation(null)).toContain("the current run");
});
