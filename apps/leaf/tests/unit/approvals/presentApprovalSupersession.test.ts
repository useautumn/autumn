import { beforeEach, expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const events: string[] = [];
const superseded = [{ id: "old" } as ChatApproval];
let cancelParams: Record<string, unknown> | undefined;

await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/createApproval.js",
	factory: () => ({
		createApproval: async () => ({
			approvalId: "replacement",
			params: {},
			preview: {},
			toolArgs: {},
			toolName: "autumn__attach",
			withheld: [],
		}),
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			cancelPendingForRun: async (params: Record<string, unknown>) => {
				cancelParams = params;
				events.push("supersede");
				return superseded;
			},
			setMessageTs: async () => events.push("store-message"),
		},
	}),
});

let edited: ChatApproval[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/surfaces/slack/superseded.js",
	factory: () => ({
		editSupersededApprovalCards: async ({
			approvals,
		}: {
			approvals: ChatApproval[];
		}) => {
			edited = approvals;
			events.push("edit-old");
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/ui/blocks.js",
	factory: () => ({
		approvalCard: (card: unknown) => card,
		approvalSheetUrl: () => undefined,
	}),
});

const { presentApproval } = await import(
	"../../../src/internal/approvals/surfaces/slack/present.js"
);

const params = {
	channelId: "C1",
	env: AppEnv.Sandbox,
	installation: { provider: "slack", workspace_id: "T1" },
	logAction: () => undefined,
	logger: { info: () => {}, warn: () => {} },
	orgId: "org_1",
	providerUserId: "U1",
	turn: { sessionId: "run_1" },
};

beforeEach(() => {
	events.length = 0;
	edited = [];
	cancelParams = undefined;
});

test("supersedes the old approval only after posting its replacement", async () => {
	await presentApproval({
		...params,
		target: {
			post: async () => {
				events.push("post-new");
				return { id: "message_1" };
			},
		} as never,
	} as never);

	expect(events).toEqual([
		"post-new",
		"supersede",
		"store-message",
		"edit-old",
	]);
	expect(cancelParams).toMatchObject({
		exceptApprovalId: "replacement",
		providerUserId: "U1",
		runId: "run_1",
	});
	expect(edited).toEqual(superseded);
});

test("keeps the old approval pending when posting fails", async () => {
	await expect(
		presentApproval({
			...params,
			target: {
				post: async () => {
					throw new Error("Slack unavailable");
				},
			} as never,
		} as never),
	).rejects.toThrow("Slack unavailable");

	expect(events).toEqual([]);
});
