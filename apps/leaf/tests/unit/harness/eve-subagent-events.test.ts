import { describe, expect, test } from "bun:test";
import {
	createEveTurnProgress,
	reduceEveTurnEvent,
} from "../../../src/internal/agentRuntime/actions/runAgentTurn/execute/eveTurnReducer.js";
import { parseEveEvent } from "../../../src/internal/agentRuntime/eve/eveEventSchemas.js";

describe("subagent events on the parent stream", () => {
	test("parses subagent.called with the child session pointer", () => {
		const event = parseEveEvent({
			data: {
				callId: "call_1",
				childSessionId: "wrun_child",
				name: "investigator",
				sequence: 0,
				toolName: "investigator",
				turnId: "turn_1",
			},
			type: "subagent.called",
		});

		expect(event).toMatchObject({
			callId: "call_1",
			childSessionId: "wrun_child",
			name: "investigator",
			type: "subagent.called",
		});
	});

	test("parses subagent.completed", () => {
		expect(
			parseEveEvent({
				data: {
					callId: "call_1",
					output: "done",
					subagentName: "investigator",
				},
				type: "subagent.completed",
			}),
		).toMatchObject({
			subagentName: "investigator",
			type: "subagent.completed",
		});
	});

	test("a delegation surfaces a progress line and records the child session", () => {
		const started = reduceEveTurnEvent({
			event: parseEveEvent({ data: {}, type: "turn.started" }),
			progress: createEveTurnProgress(),
		});
		const transition = reduceEveTurnEvent({
			event: parseEveEvent({
				data: {
					callId: "call_1",
					childSessionId: "wrun_child",
					name: "investigator",
				},
				type: "subagent.called",
			}),
			progress: started.progress,
		});

		expect(transition.effects).toEqual([
			{
				kind: "action",
				progress: {
					label: "Investigating",
					phase: "started",
					toolName: "investigator",
				},
			},
		]);
		expect(transition.progress.subagentCalls.get("call_1")).toEqual({
			childSessionId: "wrun_child",
			name: "investigator",
		});
	});

	test("subagent.completed is inert and preserves progress", () => {
		const started = reduceEveTurnEvent({
			event: parseEveEvent({ data: {}, type: "turn.started" }),
			progress: createEveTurnProgress(),
		});
		const transition = reduceEveTurnEvent({
			event: parseEveEvent({
				data: { callId: "call_1", subagentName: "investigator" },
				type: "subagent.completed",
			}),
			progress: started.progress,
		});

		expect(transition.effects).toEqual([]);
		expect(transition.progress).toBe(started.progress);
	});
});
