import { describe, expect, test } from "bun:test";
import { approvalReplyIntent } from "../../../src/internal/approvals/utils/approvalReplyIntent.js";

describe("approvalReplyIntent", () => {
	test.each([
		"approve",
		"Approve",
		"please approve",
		"pls approve",
		"yes approve",
		"approved",
		"approve it",
		"please approve this.",
	])("%p is an approval", (text) => {
		expect(approvalReplyIntent(text)).toEqual({ kind: "approve" });
	});

	test.each(["cancel", "deny", "reject it", "dismiss", "please cancel"])(
		"%p is a cancel",
		(text) => {
			expect(approvalReplyIntent(text)).toEqual({ kind: "cancel" });
		},
	);

	test.each(["1", "2", "approve the second one", "cancel which one?"])(
		"%p is ambiguous",
		(text) => {
			expect(approvalReplyIntent(text)).toEqual({ kind: "ambiguous" });
		},
	);

	test.each([
		"yes but make it 600k credits",
		"is there a trial on this plan?",
		"why did it approve the charge without asking me first?",
		"3",
		"",
	])("%p is conversation", (text) => {
		expect(approvalReplyIntent(text)).toBeUndefined();
	});
});
