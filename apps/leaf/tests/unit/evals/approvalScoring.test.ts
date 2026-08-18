import { describe, expect, test } from "bun:test";
import {
	expectedApiCallsAfterApproval,
	expectedApprovalCount,
} from "../../evals/utils/scorers.js";

const turn = ({
	skipped,
	type,
}: {
	skipped?: boolean;
	type: "approve" | "user";
}) => ({ apiCalls: [], toolCalls: [], ...(skipped ? { skipped } : {}), type });

const output = ({
	apiCalls = [],
	turns,
}: {
	apiCalls?: unknown[];
	turns: unknown[];
}) => ({ apiCalls, finalText: "", toolCalls: [], turns }) as never;

// An optional approve that found no gate used to be indistinguishable from a
// real one, so a run that never gated could score as a passing approval flow.
describe("approval scoring ignores skipped approve turns", () => {
	test("a skipped approve does not count toward the approval total", () => {
		expect(
			expectedApprovalCount({
				expected: [{ count: 2, type: "approval.count" }],
				output: output({
					turns: [
						turn({ type: "user" }),
						turn({ type: "approve" }),
						turn({ skipped: true, type: "approve" }),
					],
				}),
			}),
		).toBe(0);
	});

	test("two real approvals satisfy a count of two", () => {
		expect(
			expectedApprovalCount({
				expected: [{ count: 2, type: "approval.count" }],
				output: output({
					turns: [
						turn({ type: "user" }),
						turn({ type: "approve" }),
						turn({ type: "approve" }),
					],
				}),
			}),
		).toBe(1);
	});

	test("approvalIndex measures against the nth real approval", () => {
		const call = { body: {}, toolName: "attach" as const };
		expect(
			expectedApiCallsAfterApproval({
				expected: [{ approvalIndex: 2, call, type: "api.calledAfterApproval" }],
				output: output({
					apiCalls: [call],
					turns: [
						turn({ type: "user" }),
						turn({ type: "approve" }),
						// attach lands here, before the second approval
						{ apiCalls: [call], toolCalls: [], type: "user" as const },
						turn({ type: "approve" }),
					],
				}),
			}),
		).toBe(0);
	});
});
