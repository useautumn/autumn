import { expect, mock, test } from "bun:test";
import { AppEnv, type ChatInstallation } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

let createCalls = 0;
const cancelled: string[] = [];

await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/createApproval.js",
	factory: () => ({
		createApproval: async () => {
			createCalls += 1;
			return {
				approvalId: "approval_1",
				params: {},
				preview: undefined,
				toolArgs: { request: {} },
				toolName: "autumn__attach",
				withheld: [],
			};
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			cancel: async ({ approvalId }: { approvalId: string }) => {
				cancelled.push(approvalId);
			},
			cancelPendingForRun: async () => [],
			setMessageTs: async () => {},
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalWritesRepo.js",
	factory: () => ({
		chatApprovalWritesRepo: { list: async () => [] },
	}),
});

const { presentApproval } = await import(
	"../../../src/internal/approvals/surfaces/slack/present.js"
);

const installation = {
	provider: "slack",
	workspace_id: "W1",
} as ChatInstallation;

const presentWith = ({ isStopped }: { isStopped: () => boolean }) => {
	const posts: unknown[] = [];
	const target = {
		post: async (content: unknown) => {
			posts.push(content);
			return { id: "message_1" };
		},
	};
	return {
		posts,
		run: () =>
			presentApproval({
				channelId: "C1",
				env: AppEnv.Sandbox,
				installation,
				isStopped,
				logAction: () => {},
				orgId: "org_1",
				providerUserId: "U1",
				target: target as never,
				turn: { sessionId: "sesn_1" } as never,
			}),
	};
};

test("a stop before creation posts nothing and creates no row", async () => {
	createCalls = 0;
	const { posts, run } = presentWith({ isStopped: () => true });
	expect(await run()).toBe("stopped");
	expect(createCalls).toBe(0);
	expect(posts).toEqual([]);
});

test("a stop after creation cancels the row before any card posts", async () => {
	createCalls = 0;
	cancelled.length = 0;
	let calls = 0;
	const { posts, run } = presentWith({
		isStopped: () => {
			calls += 1;
			return calls > 1;
		},
	});
	expect(await run()).toBe("stopped");
	expect(createCalls).toBe(1);
	expect(cancelled).toEqual(["approval_1"]);
	expect(posts).toEqual([]);
});
