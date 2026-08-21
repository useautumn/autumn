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
const insertedSteps: Array<Record<string, unknown>> = [];
const storedStepPreviews: Array<{ preview: unknown; stepId: string }> = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			insert: async ({ data }: { data: Record<string, unknown> }) => {
				inserted.push(data);
				const steps = [
					{
						requestId: data.toolCallId,
						toolArgs: data.toolArgs,
						toolName: data.toolName,
					},
					...(data.groupedSteps as Array<Record<string, unknown>>),
				];
				insertedSteps.push(
					...steps.map((step, position) => ({
						...step,
						id: `chat_stp_${position}`,
						position,
						request_id: step.requestId,
						status: "pending",
						tool_args: step.toolArgs,
						tool_name: step.toolName,
					})),
				);
				return "chat_app_1";
			},
		},
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalStepsRepo.js",
	factory: () => ({
		chatApprovalStepsRepo: {
			insert: async () => undefined,
			list: async () => insertedSteps,
			setPreview: async ({
				preview,
				stepId,
			}: {
				preview: unknown;
				stepId: string;
			}) => {
				storedStepPreviews.push({ preview, stepId });
				return true;
			},
			setStatus: async () => undefined,
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
		isFailedApprovalPreview: () => false,
		resolveApprovalPreview: async ({
			request,
		}: {
			request?: { customer_id?: string };
		}) => previewFor(request?.customer_id ?? "unknown"),
		shouldRefreshApprovalPreview: () => true,
		withStepPreviews: async ({
			steps,
		}: {
			steps: Array<{ input?: { request?: { customer_id?: string } } }>;
		}) =>
			steps.map((step) => ({
				...step,
				preview: previewFor(step.input?.request?.customer_id ?? "unknown"),
			})),
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
// dashboard poll — renders from the stored rows, so the group must persist as
// step rows with previews, and the stored tool_args must carry no markers.
describe("createApproval persists the grouped steps", () => {
	test("steps persist per write and backfill stores every preview", async () => {
		inserted.length = 0;
		insertedSteps.length = 0;
		storedStepPreviews.length = 0;
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
						_eveChildSessionIds: ["wrun_1"],
						_eveDenyOptionId: "deny",
						_eveSiblingRequestIds: ["req_leaf-0002", "req_leaf-0003"],
						_eveWithheldWrites: ["leaf-0002", "leaf-0003"].map(
							(customerId) => ({
								denyOptionId: "deny",
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

		const data = inserted[0] as {
			approveOptionId?: string;
			childSessionIds?: string[];
			denyOptionId?: string;
			groupedSteps: Array<{ requestId?: string; toolName: string }>;
			toolArgs: Record<string, unknown>;
			toolName: string;
		};
		expect(data.toolName).toBe("autumn__attach");
		expect(data.groupedSteps.map((step) => step.toolName)).toEqual([
			"autumn__attach",
			"autumn__attach",
		]);
		expect(data.groupedSteps.map((step) => step.requestId)).toEqual([
			"req_leaf-0002",
			"req_leaf-0003",
		]);
		expect(data.approveOptionId).toBe("approve");
		expect(data.denyOptionId).toBe("deny");
		expect(data.childSessionIds).toEqual(["wrun_1"]);
		expect(
			Object.keys(data.toolArgs).filter((key) => key.startsWith("_eve")),
		).toEqual([]);

		// The card posts before the N preview round trips; the deferred backfill
		// persists them onto the pending step rows.
		expect(created?.backfillGroupedPreviews).toBeDefined();
		const previewed = await created?.backfillGroupedPreviews?.();
		expect(previewed).toHaveLength(2);
		expect(storedStepPreviews).toHaveLength(2);
		for (const stored of storedStepPreviews) {
			expect(stored.preview).toBeDefined();
		}
	});
});
