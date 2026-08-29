import { expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/db.js", () => ({ db: {} }));

let pendingRows: ChatApproval[] = [];
await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: { listPendingForRun: async () => pendingRows },
	}),
});

const { APPROVAL_REPLY_GUIDANCE, matchPendingApprovalReply } = await import(
	"../../../src/internal/approvals/actions/matchPendingApprovalReply.js"
);

const pendingApproval = (overrides: Partial<ChatApproval> = {}) =>
	({
		expires_at: Date.now() + 60_000,
		id: "approval_1",
		message_ts: "message_1",
		status: "pending",
		...overrides,
	}) as ChatApproval;

const match = (text: string) =>
	matchPendingApprovalReply({
		channelId: "C1",
		env: AppEnv.Sandbox,
		orgId: "org_1",
		provider: "slack",
		runId: "sesn_1",
		text,
		workspaceId: "W1",
	});

test("a bare approve decides the single pending card", async () => {
	pendingRows = [pendingApproval()];
	expect(await match("please approve")).toEqual({
		approval: pendingRows[0],
		decision: "approve",
	});
});

test("a cancel decides the single pending card", async () => {
	pendingRows = [pendingApproval()];
	expect(await match("cancel")).toEqual({
		approval: pendingRows[0],
		decision: "cancel",
	});
});

test("conversation never matches", async () => {
	pendingRows = [pendingApproval()];
	expect(await match("what would this cost?")).toBeUndefined();
});

test("no pending card falls through to the agent", async () => {
	pendingRows = [];
	expect(await match("approve")).toBeUndefined();
});

test("two pending cards get guidance", async () => {
	pendingRows = [pendingApproval(), pendingApproval({ id: "approval_2" })];
	expect(await match("approve")).toEqual({ guidance: APPROVAL_REPLY_GUIDANCE });
});

test("an expired card is not decidable", async () => {
	pendingRows = [pendingApproval({ expires_at: Date.now() - 1 })];
	expect(await match("approve")).toBeUndefined();
});

test("a card without a message gets guidance", async () => {
	pendingRows = [pendingApproval({ message_ts: null })];
	expect(await match("approve")).toEqual({ guidance: APPROVAL_REPLY_GUIDANCE });
});

test("an ambiguous reply gets guidance", async () => {
	pendingRows = [pendingApproval()];
	expect(await match("1")).toEqual({ guidance: APPROVAL_REPLY_GUIDANCE });
});
