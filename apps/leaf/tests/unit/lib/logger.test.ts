import { describe, expect, test } from "bun:test";
import { createLeafSessionContext } from "../../../src/lib/logger.js";

describe("Leaf logger context", () => {
	test("creates stable session ids and distinct trace ids", () => {
		const first = createLeafSessionContext({
			channelId: "C1",
			provider: "slack",
			providerUserId: "U1",
			threadId: "T1",
			workspaceId: "W1",
		});
		const second = createLeafSessionContext({
			channelId: "C1",
			provider: "slack",
			providerUserId: "U2",
			threadId: "T1",
			workspaceId: "W1",
		});

		expect(first.sessionId).toBe(second.sessionId);
		expect(first.traceId).not.toBe(second.traceId);
		expect(first.context).toMatchObject({
			provider: "slack",
			session_id: first.sessionId,
			trace_id: first.traceId,
			slack_channel_id: "C1",
			slack_thread_id: "T1",
			slack_workspace_id: "W1",
		});
	});
});
