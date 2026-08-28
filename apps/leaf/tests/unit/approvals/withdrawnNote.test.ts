import { describe, expect, test } from "bun:test";
import { withdrawnNoteFor } from "../../../src/internal/approvals/actions/withdrawSupersededApprovals.js";

describe("the note handed to the model after a withdrawal", () => {
	test("states that the withdrawn change is no longer pending", () => {
		const note = withdrawnNoteFor("autumn__attach");

		expect(note).toContain("withdrawn and not applied");
		expect(note).not.toContain("still pending");
	});

	test("keeps questions text-only without rebuilding the card", () => {
		const note = withdrawnNoteFor("autumn__attach");

		expect(note).toContain("question, objection, or stop/explain request");
		expect(note).toContain("do not delegate, re-issue the write, or show a card");
	});

	test("keeps attach refinements customer-specific", () => {
		expect(withdrawnNoteFor("autumn__attach")).toContain("customer-specific");
		expect(withdrawnNoteFor("autumn__updateCustomer")).not.toContain(
			"customer-specific",
		);
	});
});
