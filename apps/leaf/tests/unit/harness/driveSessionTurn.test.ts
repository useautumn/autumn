import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { driveSessionTurn } from "../../../src/harness/claudeManaged/session/driveSessionTurn.js";

const clientWithEvents = (events: Array<Record<string, unknown>>) =>
	({
		beta: {
			sessions: {
				events: {
					stream: async () =>
						(async function* stream() {
							yield* events;
						})(),
				},
			},
		},
	}) as unknown as Anthropic;

const idleEndTurn = {
	type: "session.status_idle",
	stop_reason: { type: "end_turn" },
};

describe("driveSessionTurn", () => {
	test("surfaces MCP tool errors from any server", async () => {
		const errors: Array<{ name: string; output: unknown }> = [];
		const outcome = await driveSessionTurn({
			autumnMcpServerName: "autumn",
			client: clientWithEvents([
				{
					type: "agent.mcp_tool_use",
					id: "t1",
					name: "previewAttach",
					mcp_server_name: "autumn",
					input: {},
				},
				{
					type: "agent.mcp_tool_result",
					mcp_tool_use_id: "t1",
					content: [{ type: "text", text: "boom" }],
					is_error: true,
				},
				idleEndTurn,
			]),
			kickoff: async () => {},
			onToolError: (input) => {
				errors.push(input);
			},
			sessionId: "sesn_1",
		});

		expect(errors).toHaveLength(1);
		expect(errors[0]?.name).toBe("previewAttach");
		expect(outcome.errorMessage).toBeUndefined();
	});

	test("surfaces sandbox tool calls", async () => {
		const sandboxCalls: Array<{ name: string }> = [];
		await driveSessionTurn({
			autumnMcpServerName: "autumn",
			client: clientWithEvents([
				{
					type: "agent.tool_use",
					id: "b1",
					name: "bash",
					input: { command: "sleep 45 && echo done" },
				},
				idleEndTurn,
			]),
			kickoff: async () => {},
			onSandboxTool: (input) => {
				sandboxCalls.push(input);
			},
			sessionId: "sesn_1",
		});

		expect(sandboxCalls).toHaveLength(1);
	});

	test("treats retrying session errors as transient, not turn failures", async () => {
		const retries: string[] = [];
		const outcome = await driveSessionTurn({
			autumnMcpServerName: "autumn",
			client: clientWithEvents([
				{
					type: "session.error",
					error: {
						type: "mcp_connection_failed_error",
						message: "server URL not found",
						retry_status: { type: "retrying" },
					},
				},
				{
					type: "agent.message",
					content: [{ type: "text", text: "recovered" }],
				},
				idleEndTurn,
			]),
			kickoff: async () => {},
			onSessionRetry: ({ message }) => {
				retries.push(message);
			},
			sessionId: "sesn_1",
		});

		expect(retries).toEqual(["server URL not found"]);
		expect(outcome.errorMessage).toBeUndefined();
		expect(outcome.textParts).toEqual(["recovered"]);
	});

	test("pumps multiple turns while onTurnEnd continues", async () => {
		const drainedTurns: string[][] = [];
		let turnStarts = 0;
		let continuesLeft = 1;
		const outcome = await driveSessionTurn({
			autumnMcpServerName: "autumn",
			client: clientWithEvents([
				{
					type: "agent.message",
					content: [{ type: "text", text: "first turn" }],
				},
				idleEndTurn,
				{
					type: "agent.message",
					content: [{ type: "text", text: "second turn" }],
				},
				idleEndTurn,
			]),
			kickoff: async () => {},
			onTurnStarted: () => {
				turnStarts += 1;
			},
			onTurnEnd: (turn) => {
				drainedTurns.push([...turn.textParts]);
				if (continuesLeft > 0) {
					continuesLeft -= 1;
					return "continue";
				}
				return "stop";
			},
			sessionId: "sesn_1",
		});

		expect(drainedTurns).toEqual([["first turn"], ["second turn"]]);
		expect(turnStarts).toBe(2);
		expect(outcome.textParts).toEqual(["second turn"]);
	});

	test("keeps terminal session errors as turn failures", async () => {
		const outcome = await driveSessionTurn({
			autumnMcpServerName: "autumn",
			client: clientWithEvents([
				{
					type: "session.error",
					error: {
						type: "unknown_error",
						message: "it broke",
						retry_status: { type: "terminal" },
					},
				},
				idleEndTurn,
			]),
			kickoff: async () => {},
			sessionId: "sesn_1",
		});

		expect(outcome.errorMessage).toBe("it broke");
	});
});
