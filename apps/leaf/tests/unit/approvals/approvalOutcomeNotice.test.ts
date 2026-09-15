import { describe, expect, test } from "bun:test";
import { approvalOutcomeNotice } from "../../../src/internal/approvals/utils/approvalOutcomeNotice.js";

const attachWrite = (entityId: string) => ({
	result: {
		content: [
			{
				text: JSON.stringify({ customer_id: "scale", entity_id: entityId }),
				type: "text",
			},
		],
		isError: false,
	},
	status: "applied" as const,
	tool_args: {
		approval_description: "- Attach enterprise",
		request: {
			customer_id: "scale",
			entity_id: entityId,
			plan_id: "enterprise",
		},
	},
	tool_name: "attach",
});

const VALIDATION_ERROR =
	"Tool validation failed: At least one update parameter must be provided";

describe("approvalOutcomeNotice", () => {
	// 2026-09-14: both attaches applied, but the model was handed only the
	// primary's response and reported the sibling as still pending.
	test("lists every applied write of a grouped card", () => {
		const notice = approvalOutcomeNotice({
			outcome: { result: {}, text: "", toolName: "attach", writes: [] },
			writes: [attachWrite("off-the-shelf"), attachWrite("pubsec")],
		});
		expect(notice).toStartWith("<approval_applied>");
		expect(notice).toContain("every write on the card was applied");
		expect(notice).toContain(
			'1. attach {"customer_id":"scale","entity_id":"off-the-shelf"',
		);
		expect(notice).toContain(
			'2. attach {"customer_id":"scale","entity_id":"pubsec"',
		);
		expect(notice).toContain("covering every write above");
		expect(notice).not.toContain("approval_description");
	});

	// 2026-09-11: the first write failed validation and the rest were skipped,
	// yet the model was told "approved and applied" and announced success.
	test("names a failed execution and never calls it applied", () => {
		const notice = approvalOutcomeNotice({
			outcome: { error: true, message: VALIDATION_ERROR, retryable: false },
			writes: [
				{
					result: { message: VALIDATION_ERROR },
					status: "failed",
					tool_args: { request: { entity_id: "flux-2", free_trial: {} } },
					tool_name: "updateSubscription",
				},
				{
					result: null,
					status: "skipped",
					tool_args: { request: { entity_id: "rm-employ", free_trial: {} } },
					tool_name: "updateSubscription",
				},
			],
		});
		expect(notice).toStartWith("<approval_failed>");
		expect(notice).toContain("Do NOT tell the user it was applied");
		expect(notice).toContain(`Error: ${VALIDATION_ERROR}`);
		expect(notice).toContain(`1. updateSubscription {"entity_id":"flux-2"`);
		expect(notice).toContain(`→ FAILED: ${VALIDATION_ERROR}`);
		expect(notice).toContain("2. updateSubscription");
		expect(notice).toContain("skipped because an earlier write failed");
		expect(notice).not.toContain("<approval_applied>");
	});

	test("warns off a blind retry when a write's outcome is unknown", () => {
		const notice = approvalOutcomeNotice({
			outcome: { error: true, message: "socket hang up", retryable: true },
			writes: [
				{
					result: { message: "socket hang up" },
					status: "unknown",
					tool_args: { request: { customer_id: "c1", plan_id: "pro" } },
					tool_name: "attach",
				},
			],
		});
		expect(notice).toContain("OUTCOME UNKNOWN");
		expect(notice).toContain("never re-run it blindly");
	});

	// Greptile: an executor interrupted after the running marker leaves a row
	// that must read as unknown, never as "did not apply".
	test("treats a write left running as an unknown outcome", () => {
		const notice = approvalOutcomeNotice({
			outcome: {
				error: true,
				message: "Approval writes did not run",
				retryable: true,
			},
			writes: [
				{
					result: null,
					status: "running",
					tool_args: { request: { customer_id: "c1", plan_id: "pro" } },
					tool_name: "attach",
				},
				{
					result: null,
					status: "pending",
					tool_args: { request: { customer_id: "c1", email: "a@b.c" } },
					tool_name: "updateCustomer",
				},
			],
		});
		expect(notice).toContain("1. attach");
		expect(notice).toContain("OUTCOME UNKNOWN (the call was interrupted");
		expect(notice).toContain("never re-run it blindly");
		expect(notice).toContain("2. updateCustomer");
		expect(notice).toContain("did not run");
		expect(notice).toContain("a write marked OUTCOME UNKNOWN may have");
	});

	test("falls back to the primary result when no write rows exist", () => {
		const notice = approvalOutcomeNotice({
			outcome: { result: { ok: true }, text: "", toolName: "attach" },
			writes: [],
		});
		expect(notice).toContain('1. attach → applied: {"ok":true}');
	});

	test("says nothing for a drifted card, which was not executed", () => {
		expect(
			approvalOutcomeNotice({
				outcome: { drifted: true, message: "prices changed" },
				writes: [],
			}),
		).toBeUndefined();
	});
});
