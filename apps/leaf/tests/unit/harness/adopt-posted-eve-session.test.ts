import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { adoptPostedEveSession } from "../../../src/internal/agentRuntime/eve/adoptPostedSession.js";
import type { EveSessionRef } from "../../../src/internal/agentRuntime/eve/types.js";

const sessionAt = (streamIndex: number): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		continuationToken: "token_1",
		streamIndex,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("adoptPostedEveSession", () => {
	test("rewinds the stream cursor when eve re-homed onto a new run", () => {
		const session = sessionAt(42);

		const { rehomed } = adoptPostedEveSession({
			posted: { continuationToken: "token_2", sessionId: "eve_session_2" },
			session,
		});

		expect(rehomed).toBe(true);
		expect(session.sessionId).toBe("eve_session_2");
		expect(session.state.streamIndex).toBe(0);
		expect(session.state.continuationToken).toBe("token_2");
	});

	test("keeps the cursor when the same run answered", () => {
		const session = sessionAt(42);

		const { rehomed } = adoptPostedEveSession({
			posted: { continuationToken: "token_2", sessionId: "eve_session_1" },
			session,
		});

		expect(rehomed).toBe(false);
		expect(session.state.streamIndex).toBe(42);
		expect(session.state.continuationToken).toBe("token_2");
	});
});
