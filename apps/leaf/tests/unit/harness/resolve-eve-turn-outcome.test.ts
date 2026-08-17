import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, type CatalogPlanPreview } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Stubbed first and left stubbed: `env` parses leaf's whole schema at import and
// `db` opens a Postgres pool, so neither has a real namespace to restore.
mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const deletedSessionIds: string[] = [];
await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async ({ sessionId }: { sessionId: string }) => {
			deletedSessionIds.push(sessionId);
		},
	}),
});

const { resolveAgentTurnOutcome } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/finalize/resolveAgentTurnOutcome.js"
);

const logger = { warn: () => {} } as unknown as AutumnLogger;
const session = {
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		version: 1 as const,
		continuationToken: "token_1",
		streamIndex: 4,
		status: "waiting" as const,
		lastEventAt: 0,
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
};

const resolve = (
	outcome: Parameters<typeof resolveAgentTurnOutcome>[0]["outcome"],
) =>
	resolveAgentTurnOutcome({
		env: AppEnv.Sandbox,
		logger,
		orgId: "org_1",
		outcome,
		session,
	});

describe("resolveAgentTurnOutcome", () => {
	beforeEach(() => {
		deletedSessionIds.length = 0;
	});

	test("drops the session only when the stream produced nothing at all", async () => {
		const output = await resolve({ kind: "unreachable" });

		expect(deletedSessionIds).toEqual(["eve_session_1"]);
		expect(output).toEqual({ kind: "empty", sessionId: "eve_session_1" });
	});

	test("keeps the session when a turn ran and simply said nothing", async () => {
		const output = await resolve({ kind: "silent" });

		expect(deletedSessionIds).toEqual([]);
		expect(output).toEqual({ kind: "empty", sessionId: "eve_session_1" });
	});

	test("carries a catalog decision through as a plan", async () => {
		const plan = { plan_id: "pro" } as CatalogPlanPreview;
		const output = await resolve({
			kind: "answered",
			catalogDecision: plan as never,
			text: "Here's the change.",
		});

		expect(output).toEqual({
			kind: "catalog_decision",
			plan,
			sessionId: "eve_session_1",
			text: "Here's the change.",
		});
	});

	test("a plain answer carries no decision card", async () => {
		const output = await resolve({ kind: "answered", text: "Attached pro." });

		expect(output).toEqual({
			kind: "reply",
			sessionId: "eve_session_1",
			text: "Attached pro.",
		});
	});

	test("surfaces a gated write as a suspension", async () => {
		const approval = {
			toolCallId: "req_1",
			toolName: "autumn__attach",
			toolArgs: { plan_id: "pro" },
			preview: undefined,
		};
		const output = await resolve({ approval, kind: "suspended", text: "" });

		expect(output).toEqual({
			approval,
			kind: "approval",
			sessionId: "eve_session_1",
			text: "",
		});
		expect(deletedSessionIds).toEqual([]);
	});

	test("a user stop reports the reason", async () => {
		const output = await resolve({
			kind: "stopped",
			stopReason: "user",
			text: "partial",
		});

		expect(output).toEqual({
			kind: "stopped",
			reason: "user",
			sessionId: "eve_session_1",
			text: "partial",
		});
	});
});
