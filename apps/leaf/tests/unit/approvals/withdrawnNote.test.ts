/**
 * Prod 2026-08-27 15:02-15:19 wrun_01M11VWFHK7C3660GD6N2410WM: four attach
 * cards raised, all four withdrawn, none applied. A withdrawal denies the card
 * in eve, so nothing is pending afterwards — but the note told the model to
 * answer a question by saying the change was "still pending", leaving the user
 * with no card to confirm and the turn back where it started.
 */

import { describe, expect, test } from "bun:test";
import { withdrawnNoteFor } from "../../../src/internal/approvals/actions/withdrawSupersededApprovals.js";

describe("the note handed to the model after a withdrawal", () => {
	test("never claims the withdrawn change is still pending", () => {
		const note = withdrawnNoteFor("autumn__attach");

		// The card was denied in eve; telling the model it is still pending
		// strands the user with nothing to approve.
		expect(note).not.toContain("still pending");
	});

	test("tells the model to re-raise the card when the reply is a question", () => {
		const note = withdrawnNoteFor("autumn__attach");

		expect(note.toLowerCase()).toContain("question");
		expect(note).toMatch(/re-?issue|rebuild|raise|show the card again/i);
	});

	test("keeps the attach-specific refinement guidance", () => {
		expect(withdrawnNoteFor("autumn__attach")).toContain("customer-specific");
		expect(withdrawnNoteFor("autumn__updateCustomer")).not.toContain(
			"customer-specific",
		);
	});
});
