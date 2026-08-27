import { describe, expect, test } from "bun:test";
import {
	type EveTurnOutcome,
	type EveTurnProgress,
	reduceEveTurnEvent,
} from "../../../src/internal/agentRuntime/actions/runAgentTurn/execute/eveTurnReducer.js";
import type { EveEvent } from "../../../src/internal/agentRuntime/eve/eveEventSchemas.js";

const blankProgress = (): EveTurnProgress => ({
	finalText: "",
	pendingText: "",
	sawToolActivity: false,
	subagentChildSessionIds: new Set(),
	subagentStartedAtByCallId: new Map(),
	toolInputs: new Map(),
	toolLabels: new Map(),
	turnStarted: false,
});

const event = (partial: Record<string, unknown>) =>
	partial as unknown as EveEvent;

const drive = (events: Array<Record<string, unknown>>) => {
	let progress = blankProgress();
	let outcome: EveTurnOutcome | undefined;
	for (const raw of events) {
		const transition = reduceEveTurnEvent({ event: event(raw), progress });
		progress = transition.progress;
		if (transition.outcome) outcome = transition.outcome;
	}
	return outcome;
};

const ranTools = [
	{ callId: "c1", toolName: "autumn__getCustomer" },
	{ callId: "c2", toolName: "autumn__listPlans" },
];

describe("a tool call that never dispatches", () => {
	test("parking with an unresolved call reports the stalled tool", () => {
		// Prod 2026-08-27 13:48: the child asked for connection_search, eve never
		// dispatched it, and the turn parked with no result and no next step.
		const outcome = drive([
			{ type: "turn.started" },
			{ type: "step.started" },
			{ actions: ranTools, type: "actions.requested" },
			...ranTools.map((result) => ({
				result,
				status: "ok",
				type: "action.result",
			})),
			{ type: "step.started" },
			{
				actions: [{ callId: "c3", toolName: "connection_search" }],
				type: "actions.requested",
			},
			{ type: "session.waiting" },
		]);

		expect(outcome).toMatchObject({
			kind: "stalled",
			tools: ["Connection search"],
		});
	});

	test("a turn whose calls all resolved stays silent", () => {
		const outcome = drive([
			{ type: "turn.started" },
			{ type: "step.started" },
			{ actions: ranTools, type: "actions.requested" },
			...ranTools.map((result) => ({
				result,
				status: "ok",
				type: "action.result",
			})),
			{ type: "session.waiting" },
		]);

		expect(outcome).toMatchObject({ kind: "silent" });
	});

	test("the model's tool-calls finish does not count as an answer", () => {
		// eve emits message.completed with finishReason "tool-calls" carrying the
		// undispatched call, which must not read as a reply to the user.
		const outcome = drive([
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				actions: [{ callId: "c1", toolName: "connection_search" }],
				type: "actions.requested",
			},
			{ finishReason: "tool-calls", message: "", type: "message.completed" },
			{ type: "session.waiting" },
		]);

		expect(outcome).toMatchObject({ kind: "stalled" });
	});

	test("a turn that answered is unaffected by an unresolved call", () => {
		const outcome = drive([
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				actions: [{ callId: "c1", toolName: "connection_search" }],
				type: "actions.requested",
			},
			{ message: "Here is the plan.", type: "message.completed" },
			{ type: "session.waiting" },
		]);

		expect(outcome).toMatchObject({ kind: "answered" });
	});
});
