import { describe, expect, test } from "bun:test";
import {
	expectedApiCallsAfterApproval,
	expectedApprovalCount,
} from "../../evals/utils/scorers.js";

type Turn = {
	apiCalls: Array<{ body: unknown; toolName: string }>;
	skipped?: boolean;
	type: "approve" | "user";
};

/** Mirrors createEvalContext: each turn snapshots the cumulative call list. */
const runScriptedTurns = (
	script: Array<{ calls?: string[]; gated: boolean; type: "approve" | "user" }>,
) => {
	const cumulative: Array<{ body: unknown; toolName: string }> = [];
	const turns: Turn[] = [];
	for (const step of script) {
		const skipped = step.type === "approve" && !step.gated;
		if (!skipped) {
			for (const toolName of step.calls ?? []) {
				cumulative.push({ body: {}, toolName });
			}
		}
		turns.push({
			apiCalls: [...cumulative],
			...(skipped ? { skipped: true } : {}),
			type: step.type,
		});
	}
	return { apiCalls: cumulative, finalText: "", toolCalls: [], turns } as never;
};

// The chained flow the Slack bot actually runs: one gated write, approve, then
// a second gated write born from the resumed turn.
describe("chained approval flow scoring", () => {
	test("scores a genuine two-approval run", () => {
		const output = runScriptedTurns([
			{ gated: false, type: "user" },
			{ calls: ["updateCustomer"], gated: true, type: "approve" },
			{ calls: ["attach"], gated: true, type: "approve" },
		]);

		expect(
			expectedApprovalCount({
				expected: [{ count: 2, type: "approval.count" }],
				output,
			}),
		).toBe(1);
		expect(
			expectedApiCallsAfterApproval({
				expected: [
					{
						approvalIndex: 2,
						call: { body: {}, toolName: "attach" as const },
						type: "api.calledAfterApproval",
					},
				],
				output,
			}),
		).toBe(1);
	});

	// The regression that used to pass silently: the model did both writes up
	// front, the second approve found no gate, and the run still scored green.
	test("fails a run that collapsed both writes before the gate", () => {
		const output = runScriptedTurns([
			{ calls: ["updateCustomer", "attach"], gated: false, type: "user" },
			{ gated: true, type: "approve" },
			{ gated: false, type: "approve" },
		]);

		expect(
			expectedApprovalCount({
				expected: [{ count: 2, type: "approval.count" }],
				output,
			}),
		).toBe(0);
		expect(
			expectedApiCallsAfterApproval({
				expected: [
					{
						approvalIndex: 2,
						call: { body: {}, toolName: "attach" as const },
						type: "api.calledAfterApproval",
					},
				],
				output,
			}),
		).toBe(0);
	});
});
