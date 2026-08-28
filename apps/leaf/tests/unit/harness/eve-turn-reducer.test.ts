import { describe, expect, test } from "bun:test";
import {
	createEveTurnProgress,
	reduceEveTurnEvent,
} from "../../../src/internal/agentRuntime/actions/runAgentTurn/execute/eveTurnReducer.js";
import type { EveInputRequest } from "../../../src/internal/agentRuntime/eve/eveEventSchemas.js";

const approvalRequest = ({
	input = {},
	requestId,
	toolName,
}: {
	input?: EveInputRequest["action"]["input"];
	requestId: string;
	toolName: string;
}): EveInputRequest => ({
	action: { callId: requestId, input, kind: "tool-call", toolName },
	allowFreeform: false,
	display: "confirmation",
	options: [
		{ id: "approve", label: "Yes" },
		{ id: "deny", label: "No" },
	],
	prompt: `Approve tool call: ${toolName}`,
	requestId,
});

describe("Eve turn reducer", () => {
	test("reduces a streamed reply after the current turn starts", () => {
		const initial = {
			...createEveTurnProgress(),
			lastPreview: {
				preview: { total: 20 },
				previewTool: "previewAttach",
			},
		};
		const replayed = reduceEveTurnEvent({
			createReasoningId: () => "reasoning_1",
			event: { messageDelta: "old", type: "message.appended" },
			progress: initial,
		});
		expect(replayed.progress).toBe(initial);

		const started = reduceEveTurnEvent({
			event: { type: "turn.started" },
			progress: replayed.progress,
		});
		expect(started.progress).toMatchObject({
			lastPreview: undefined,
			turnStarted: true,
		});
		expect(initial.lastPreview).toEqual({
			preview: { total: 20 },
			previewTool: "previewAttach",
		});

		const appended = reduceEveTurnEvent({
			createReasoningId: () => "reasoning_1",
			event: { messageDelta: "Hel", type: "message.appended" },
			progress: started.progress,
		});
		expect(appended.effects).toEqual([
			{ id: "reasoning_1", kind: "reasoning", text: "Hel" },
		]);

		const completed = reduceEveTurnEvent({
			event: {
				finishReason: "stop",
				message: "Hello",
				type: "message.completed",
			},
			progress: appended.progress,
		});
		expect(completed.effects).toEqual([
			{ id: "reasoning_1", kind: "reasoning", text: "" },
		]);

		const terminal = reduceEveTurnEvent({
			event: { type: "session.completed" },
			progress: completed.progress,
		});
		expect(terminal.effects).toEqual([{ kind: "save_session" }]);
		expect(terminal.outcome).toMatchObject({ kind: "answered", text: "Hello" });
	});

	test("suspends a gated write without mutating prior tool state", () => {
		const request = { customer_id: "cus_1", plan_id: "pro" };
		const progress = {
			...createEveTurnProgress(),
			finalText: "Ready to attach Pro.",
			lastPreview: {
				preview: { currency: "usd", line_items: [], total: 20 },
				previewTool: "previewAttach",
				request,
			},
			turnStarted: true,
		};
		const requested = reduceEveTurnEvent({
			event: {
				actions: [
					{
						callId: "call_1",
						input: { request },
						toolName: "autumn__attach",
					},
				],
				type: "actions.requested",
			},
			progress,
		});
		expect(progress.toolInputs.size).toBe(0);
		expect(requested.progress.toolInputs.get("call_1")).toEqual({ request });
		expect(requested.effects).toEqual([
			{
				kind: "action",
				progress: {
					label: "Attaching the plan",
					phase: "started",
					toolName: "autumn__attach",
				},
			},
		]);

		const completed = reduceEveTurnEvent({
			event: {
				result: {
					callId: "call_1",
					output: { ok: true },
					toolName: "autumn__attach",
				},
				status: "completed",
				type: "action.result",
			},
			progress: requested.progress,
		});
		expect(completed.effects).toEqual([
			{
				kind: "action",
				progress: {
					label: "Attaching the plan",
					output: { ok: true },
					phase: "completed",
					status: "completed",
					toolName: "autumn__attach",
				},
			},
		]);

		const suspended = reduceEveTurnEvent({
			event: {
				requests: [
					approvalRequest({
						input: { request },
						requestId: "req_1",
						toolName: "autumn__attach",
					}),
					approvalRequest({
						requestId: "req_2",
						toolName: "autumn__updateSubscription",
					}),
				],
				type: "input.requested",
			},
			progress: requested.progress,
		});
		// The park is persisted with the option that releases each request, so a
		// later message can never be posted over it unanswered.
		expect(suspended.effects).toHaveLength(1);
		expect(suspended.effects[0]).toMatchObject({ kind: "save_session" });
		expect(
			(suspended.effects[0] as { pendingRequests?: unknown[] }).pendingRequests,
		).toEqual([
			{ denyOptionId: "deny", kind: "gated", requestId: "req_1" },
			{ denyOptionId: "deny", kind: "gated", requestId: "req_2" },
		]);
		expect(suspended.outcome).toEqual({
			approval: {
				preview: { currency: "usd", line_items: [], total: 20 },
				toolArgs: {
					_eveApproveOptionId: "approve",
					_eveDenyOptionId: "deny",
					_eveSiblingRequestIds: ["req_2"],
					_eveWithheldWrites: [
						{
							denyOptionId: "deny",
							input: {},
							requestId: "req_2",
							toolName: "autumn__updateSubscription",
						},
					],
					request,
				},
				toolCallId: "req_1",
				toolName: "autumn__attach",
			},
			kind: "suspended",
			text: "Ready to attach Pro.",
		});
	});

	test("discards a failed session before surfacing the error", () => {
		const transition = reduceEveTurnEvent({
			event: { message: "Eve failed", type: "session.failed" },
			progress: { ...createEveTurnProgress(), turnStarted: true },
		});

		expect(transition.effects).toEqual([
			{ kind: "save_session" },
			{ kind: "delete_session" },
			{ kind: "throw", message: "Eve failed" },
		]);
		expect(transition.outcome).toBeUndefined();
	});
});

// The prompt requires a preview first, so the writes park on a LATER turn than
// the preview call — the batch must still group into one approval.
describe("a batch parked after a preview turn", () => {
	test("groups both writes from a post-preview park", () => {
		const started = reduceEveTurnEvent({
			event: { type: "turn.started" },
			progress: createEveTurnProgress(),
		});
		const requested = reduceEveTurnEvent({
			event: {
				actions: [{ callId: "call_p", toolName: "autumn__previewAttach" }],
				type: "actions.requested",
			},
			progress: started.progress,
		});
		const previewed = reduceEveTurnEvent({
			event: {
				result: {
					callId: "call_p",
					output: { total: 100, currency: "usd" },
					toolName: "autumn__previewAttach",
				},
				status: "completed",
				type: "action.result",
			},
			progress: requested.progress,
		});
		const suspended = reduceEveTurnEvent({
			event: {
				requests: [
					approvalRequest({
						input: { request: { customer_id: "cus_1", email: "n@x.com" } },
						requestId: "req_1",
						toolName: "autumn__updateCustomer",
					}),
					approvalRequest({
						input: { request: { customer_id: "cus_1", plan_id: "pro" } },
						requestId: "req_2",
						toolName: "autumn__attach",
					}),
				],
				type: "input.requested",
			},
			progress: previewed.progress,
		});

		expect(suspended.outcome).toMatchObject({
			approval: {
				toolArgs: {
					_eveSiblingRequestIds: ["req_2"],
					_eveWithheldWrites: [{ toolName: "autumn__attach" }],
				},
				toolName: "autumn__updateCustomer",
			},
			kind: "suspended",
		});
	});
});
