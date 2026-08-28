import { expect, mock, test } from "bun:test";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

mock.module("../../../src/lib/db.js", () => ({ db: {} }));
mock.module("../../../src/lib/logger.js", () => ({
	logger: { warn: () => undefined },
}));

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({ deleteEveSession: async () => undefined }),
});

const cancelledApprovalIds: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			cancel: async ({ approvalId }: { approvalId: string }) => {
				cancelledApprovalIds.push(approvalId);
			},
			listPendingForRun: async () => [
				{ id: "session_bound", tool_call_id: "tool_call_1" },
				{ id: "detached", tool_call_id: null },
			],
		},
	}),
});

const { abandonEveSession } = await import(
	"../../../src/internal/agentRuntime/eve/abandonSession.js"
);

test("abandoning Eve keeps detached approvals durable", async () => {
	await abandonEveSession({
		env: "sandbox" as never,
		orgId: "org_1",
		providerUserId: "U1",
		reason: "session_dead",
		session: {
			sessionId: "session_1",
			threadKey: "thread_key",
		} as never,
		thread: {
			channelId: "C1",
			provider: "slack",
			workspaceId: "T1",
		} as never,
	});

	expect(cancelledApprovalIds).toEqual(["session_bound"]);
});
