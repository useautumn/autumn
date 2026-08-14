import { describe, expect, test } from "bun:test";
import {
	createEveTurnProgress,
	reduceEveTurnEvent,
} from "../../../src/internal/agentRuntime/actions/runAgentTurn/execute/eveTurnReducer.js";

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
		expect(terminal.effects).toEqual([
			{ kind: "save_session", status: "completed" },
		]);
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

		const suspended = reduceEveTurnEvent({
			event: {
				requests: [
					{
						action: { input: { request }, toolName: "autumn__attach" },
						options: [
							{ id: "confirm", label: "Approve" },
							{ id: "cancel", label: "Deny" },
						],
						requestId: "req_1",
					},
					{
						action: { toolName: "autumn__updateSubscription" },
						requestId: "req_2",
					},
				],
				type: "input.requested",
			},
			progress: requested.progress,
		});
		expect(suspended.effects).toEqual([
			{ kind: "save_session", status: "waiting" },
		]);
		expect(suspended.outcome).toEqual({
			approval: {
				preview: { currency: "usd", line_items: [], total: 20 },
				toolArgs: {
					_eveApproveOptionId: "confirm",
					_eveDenyOptionId: "cancel",
					_eveSiblingRequestIds: ["req_2"],
					request,
				},
				toolCallId: "req_1",
				toolName: "autumn__attach",
			},
			kind: "suspended",
			text: "Ready to attach Pro.",
		});
	});

	test("persists failure before surfacing the error", () => {
		const transition = reduceEveTurnEvent({
			event: { message: "Eve failed", type: "session.failed" },
			progress: { ...createEveTurnProgress(), turnStarted: true },
		});

		expect(transition.effects).toEqual([
			{ kind: "save_session", status: "failed" },
			{ kind: "throw", message: "Eve failed" },
		]);
		expect(transition.outcome).toBeUndefined();
	});
});
