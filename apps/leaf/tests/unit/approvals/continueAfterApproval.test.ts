/**
 * The follow-up turn after a decided card must run for the internal admin
 * install acting as another org: the approval carries the org acted on, the
 * installation row carries the installer's org, and matching the two found
 * nothing, so the model was never told the outcome.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ChatApproval } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const adminInstallation = {
	id: "chat_inst_admin",
	org_id: "org_autumn",
	provider: "slack_admin:777.111",
	workspace_id: "T07",
};
const lookups: Array<{ provider: string; workspaceId: string }> = [];
let installationRow: unknown = adminInstallation;
await mockLeafModule({
	specifier: "../../../src/providers/slack/installations.js",
	factory: () => ({
		findInstallation: async (provider: string, workspaceId: string) => {
			lookups.push({ provider, workspaceId });
			return installationRow;
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalWritesRepo.js",
	factory: () => ({
		chatApprovalWritesRepo: {
			list: async () => [
				{
					result: { ok: true },
					status: "applied",
					tool_args: { request: { customer_id: "lucas", plan_id: "pro" } },
					tool_name: "updateSubscription",
				},
				{
					result: { ok: true },
					status: "applied",
					tool_args: { request: { customer_id: "b6", plan_id: "pro" } },
					tool_name: "updateSubscription",
				},
			],
		},
	}),
});

const turns: Array<{ installation: unknown; text: string }> = [];
await mockLeafModule({
	specifier: "../../../src/providers/slack/actions/runSlackAgentTurn.js",
	factory: () => ({
		runSlackAgentTurn: async (input: {
			installation: unknown;
			text: string;
		}) => {
			turns.push({ installation: input.installation, text: input.text });
			return { kind: "reply", sessionId: "s1", text: "Both updated." };
		},
	}),
});

const presented: unknown[] = [];
await mockLeafModule({
	specifier: "../../../src/providers/slack/presenters/presentSlackAgentTurn.js",
	factory: () => ({
		presentSlackAgentTurn: async (input: { turn: unknown }) => {
			presented.push(input.turn);
		},
	}),
});

const { continueAfterApproval } = await import(
	"../../../src/internal/approvals/actions/continueAfterApproval.js"
);

// The org acted on (resend) is not the installation's org (autumn).
const approval = {
	channel_id: "slack:C1",
	id: "chat_app_1",
	org_id: "org_resend",
	provider: "slack_admin:777.111",
	workspace_id: "T07",
} as unknown as ChatApproval;

const outcome = { result: {}, text: "", toolName: "updateSubscription" };
const target = { post: async () => ({ id: "m1" }) } as never;

describe("continueAfterApproval", () => {
	beforeEach(() => {
		lookups.length = 0;
		turns.length = 0;
		presented.length = 0;
		installationRow = adminInstallation;
	});

	test("resumes the agent on the admin install acting as another org", async () => {
		await continueAfterApproval({
			approval,
			outcome,
			providerUserId: "U1",
			target,
			threadId: "thread_1",
		});

		expect(lookups).toEqual([
			{ provider: "slack_admin:777.111", workspaceId: "T07" },
		]);
		expect(turns).toHaveLength(1);
		expect(turns[0]?.installation).toBe(adminInstallation);
		expect(turns[0]?.text).toContain("<approval_applied>");
		expect(turns[0]?.text).toContain(
			'1. updateSubscription {"customer_id":"lucas"',
		);
		expect(turns[0]?.text).toContain(
			'2. updateSubscription {"customer_id":"b6"',
		);
		expect(presented).toHaveLength(1);
	});

	test("does nothing when the workspace has no installation", async () => {
		installationRow = undefined;
		await continueAfterApproval({
			approval,
			outcome,
			providerUserId: "U1",
			target,
			threadId: "thread_1",
		});

		expect(turns).toHaveLength(0);
		expect(presented).toHaveLength(0);
	});
});
