import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { adoptPostedEveSession } from "../../../src/harness/eve/adoptPostedSession.js";
import type { EveSessionRef } from "../../../src/harness/eve/types.js";

const sessionAt = (streamIndex: number): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		version: 1,
		continuationToken: "token_1",
		streamIndex,
		status: "waiting",
		lastEventAt: 0,
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("adoptPostedEveSession", () => {
	test("rewinds the stream cursor when eve re-homed onto a new run", () => {
		const session = sessionAt(42);

		const { rehomed } = adoptPostedEveSession({
			posted: { continuationToken: "token_2", sessionId: "eve_session_2" },
			session,
			status: "running",
		});

		expect(rehomed).toBe(true);
		expect(session.sessionId).toBe("eve_session_2");
		expect(session.state.streamIndex).toBe(0);
		expect(session.state.continuationToken).toBe("token_2");
		expect(session.state.status).toBe("running");
	});

	test("keeps the cursor when the same run answered", () => {
		const session = sessionAt(42);

		const { rehomed } = adoptPostedEveSession({
			posted: { continuationToken: "token_2", sessionId: "eve_session_1" },
			session,
			status: "running",
		});

		expect(rehomed).toBe(false);
		expect(session.state.streamIndex).toBe(42);
		expect(session.state.continuationToken).toBe("token_2");
	});

	test("leaves the status alone when the caller does not set one", () => {
		const session = sessionAt(7);

		adoptPostedEveSession({
			posted: { continuationToken: "token_2", sessionId: "eve_session_1" },
			session,
		});

		expect(session.state.status).toBe("waiting");
		expect(session.state.lastEventAt).toBeGreaterThan(0);
	});
});
