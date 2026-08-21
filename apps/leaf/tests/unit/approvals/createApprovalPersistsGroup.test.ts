import { describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
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

const inserted: Array<Record<string, unknown>> = [];
const updatedToolArgs: Array<Record<string, unknown>> = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			insert: async ({ data }: { data: Record<string, unknown> }) => {
				inserted.push(data);
				return "chat_app_1";
			},
			setToolArgs: async ({
				toolArgs,
			}: {
				toolArgs: Record<string, unknown>;
			}) => {
				updatedToolArgs.push(toolArgs);
				return true;
			},
		},
	}),
});

const previewFor = (customerId: string) => ({
	content: [
		{
			type: "text",
			text: JSON.stringify({
				currency: "usd",
				customer_id: customerId,
				line_items: [],
				total: 2400,
			}),
		},
	],
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/utils/fetchApprovalPreview.js",
	factory: () => ({
		FAILED_APPROVAL_PREVIEW: { failed: true },
		fetchApprovalPreview: async ({
			request,
		}: {
			request: { customer_id: string };
		}) => previewFor(request.customer_id),
		isFailedApprovalPreview: () => false,
		shouldRefreshApprovalPreview: () => true,
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/utils/approvalDisplay.js",
	factory: () => ({
		resolveApprovalDisplay: async () => ({}),
		withApprovalDisplay: ({ preview }: { preview: unknown }) => preview,
	}),
});

const { createApproval } = await import(
	"../../../src/internal/approvals/actions/createApproval.js"
);

// Every card after the first post — running, resolved, superseded, and the
// dashboard poll — renders from the stored row, so the step previews backfilled
// for the pending card must be persisted, not only returned.
describe("createApproval persists the grouped-step previews", () => {
	test("the stored tool_args carry a preview for every grouped write", async () => {
		inserted.length = 0;
		updatedToolArgs.length = 0;
		const created = await createApproval({
			channelId: "C1",
			env: AppEnv.Sandbox,
			getToken: async () => "tok",
			logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
			orgId: "org_1",
			provider: "slack",
			providerUserId: "U1",
			turn: {
				approval: {
					toolArgs: {
						_eveApproveOptionId: "approve",
						_eveDenyOptionId: "deny",
						_eveSiblingRequestIds: ["req_leaf-0002", "req_leaf-0003"],
						_eveWithheldWrites: ["leaf-0002", "leaf-0003"].map(
							(customerId) => ({
								input: {
									request: {
										customer_id: customerId,
										plan_id: "security_pack",
									},
								},
								requestId: `req_${customerId}`,
								toolName: "autumn__attach",
							}),
						),
						request: { customer_id: "leaf-0001", plan_id: "security_pack" },
					},
					toolCallId: "req_1",
					toolName: "autumn__attach",
				},
				sessionId: "eve_1",
			} as never,
			workspaceId: "T1",
		});

		// The card posts before the N preview round trips; the deferred backfill
		// persists them onto the pending row.
		expect(created?.backfillGroupedPreviews).toBeDefined();
		await created?.backfillGroupedPreviews?.();
		const stored = updatedToolArgs[0] as {
			_eveApproveOptionId?: string;
			_eveSiblingRequestIds?: string[];
			_eveWithheldWrites: Array<{ preview?: unknown }>;
		};
		expect(stored._eveWithheldWrites).toHaveLength(2);
		for (const step of stored._eveWithheldWrites) {
			expect(step.preview).toBeDefined();
		}
		// The approve click reads these off the row; enriching must not strip them.
		expect(stored._eveApproveOptionId).toBe("approve");
		expect(stored._eveSiblingRequestIds).toEqual([
			"req_leaf-0002",
			"req_leaf-0003",
		]);
	});
});
