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
let released: ChatApproval[] = [];
const warnings: string[] = [];

await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/createApproval.js",
	factory: () => ({
		createApproval: async () => ({
			approvalId: "replacement",
			params: {},
			preview: {
				_display: { planNames: { scale: "Scale" } },
				preview: {},
			},
			toolArgs: {
				approval_summary:
					"I treated the requested amount as Scale's monthly base price.",
				request: { customer_id: "cus_1", plan_id: "scale" },
			},
			toolName: "autumn__attach",
			withheld: [],
		}),
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/releaseSupersededPark.js",
	factory: () => ({
		releaseSupersededPark: async ({ approval }: { approval: ChatApproval }) => {
			released.push(approval);
			events.push("release-old");
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalWritesRepo.js",
	factory: () => ({
		chatApprovalWritesRepo: { list: async () => [] },
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
const { postApprovalCardForRow } = await import(
	"../../../src/internal/approvals/surfaces/slack/present.js"
);

const params = {
	channelId: "C1",
	env: AppEnv.Sandbox,
	installation: { provider: "slack", workspace_id: "T1" },
	logAction: () => undefined,
	logger: {
		info: () => {},
		warn: (message: string) => warnings.push(message),
	},
	orgId: "org_1",
	providerUserId: "U1",
	turn: { sessionId: "run_1" },
};

beforeEach(() => {
	events.length = 0;
	edited = [];
	released = [];
	cancelParams = undefined;
	warnings.length = 0;
});

test("supersedes the old approval only after posting its replacement", async () => {
	await presentApproval({
		...params,
		target: {
			post: async (message: { markdown?: string }) => {
				events.push(message.markdown ? "post-summary" : "post-new");
				return { id: "message_1" };
			},
		} as never,
	} as never);

	expect(events).toEqual([
		"post-new",
		"supersede",
		"store-message",
		"edit-old",
		"post-summary",
		"release-old",
	]);
	expect(cancelParams).toMatchObject({
		exceptApprovalId: "replacement",
		providerUserId: "U1",
		runId: "run_1",
	});
	expect(edited).toEqual(superseded);
	expect(released).toEqual(superseded);
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

test("keeps the card successful when its companion fails", async () => {
	let posts = 0;
	const result = await presentApproval({
		...params,
		target: {
			post: async () => {
				posts += 1;
				if (posts === 2) throw new Error("Slack companion failed");
				return { id: "message_1" };
			},
		} as never,
	} as never);

	expect(result).toBe("posted");
	expect(warnings).toContain("Could not post approval companion");
});

test("posts one companion after a chained approval card", async () => {
	const approval = {
		channel_id: "C1",
		env: AppEnv.Sandbox,
		id: "chained",
		org_id: "org_1",
		preview: {
			_display: { planNames: { scale: "Scale" } },
			preview: {},
		},
		provider: "slack",
		tool_args: {
			approval_summary: "This updates the existing subscription immediately.",
			request: { customer_id: "cus_1", plan_id: "scale" },
		},
		tool_name: "attach",
	} as unknown as ChatApproval;
	const posted: Array<{ markdown?: string }> = [];

	await postApprovalCardForRow({
		approval,
		logger: params.logger as never,
		target: {
			post: async (message: unknown) => {
				posted.push(message as { markdown?: string });
				return { id: "message_1" };
			},
		},
	});

	expect(posted).toHaveLength(2);
	expect(posted[0]?.markdown).toBeUndefined();
	expect(posted[1]?.markdown).toBe(
		"This updates the existing subscription immediately.",
	);
});
