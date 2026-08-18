import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import { writeToPreviewTool } from "./toolRegistry.js";

export const shouldRefreshApprovalPreview = ({
	preview,
	toolName,
}: {
	preview: unknown;
	toolName: string;
}) => {
	const name = normalizeToolName(toolName);
	return !preview || name === "updatePlan" || name === "updateCatalog";
};

const previewRequestForWrite = ({
	request,
	toolName,
}: {
	request: Record<string, unknown>;
	toolName: string;
}) => {
	const withCatalogDefaults = (catalogRequest: Record<string, unknown>) => ({
		features: [],
		plans: [],
		skip_deletions: true,
		skip_feature_ids: [],
		skip_plan_ids: [],
		...catalogRequest,
	});
	const name = normalizeToolName(toolName);
	if (name === "createPlan") {
		return withCatalogDefaults({
			expand: ["plan"],
			plans: [request],
			skip_deletions: true,
		});
	}
	if (name === "createReward") {
		return withCatalogDefaults({
			rewards: [request],
			skip_deletions: true,
		});
	}
	if (name === "updatePlan") {
		return withCatalogDefaults({
			expand: ["plan"],
			plans: [
				{
					...request,
					include_variants: true,
					include_versions: true,
				},
			],
			skip_deletions: true,
		});
	}
	// Catalog updates need the variant/version previews for the decision gate,
	// and the model rarely passes the flags itself.
	if (name === "updateCatalog" && Array.isArray(request.plans)) {
		const expand = Array.isArray(request.expand) ? request.expand : [];
		return withCatalogDefaults({
			...request,
			expand: [...new Set([...expand, "plan"])],
			plans: (request.plans as Record<string, unknown>[]).map((plan) => ({
				...plan,
				include_variants: true,
				include_versions: true,
				// The MCP input schema requires `variants` once include flags are
				// set; an empty list is a no-op for preview purposes.
				variants: plan.variants ?? [],
			})),
		});
	}
	return request;
};

// The agent may suspend on a write whose preview wasn't captured this run —
// backfill the money facts so the card never loses them.
export const fetchApprovalPreview = async ({
	env,
	executeTool = executeAutumnMcpTool,
	logger,
	request,
	token,
	toolName,
}: {
	env: AppEnv;
	executeTool?: typeof executeAutumnMcpTool;
	logger: Pick<AutumnLogger, "warn">;
	request: Record<string, unknown>;
	token: string;
	toolName: string;
}): Promise<unknown> => {
	const previewTool = writeToPreviewTool(toolName);
	if (!previewTool) return undefined;
	try {
		const result = await executeTool({
			env,
			token,
			toolName: previewTool,
			args: { request: previewRequestForWrite({ request, toolName }) },
		});
		// Failed previews use two response shapes; neither should replace the
		// card's params-only fallback.
		if (result && typeof result === "object") {
			const record = result as Record<string, unknown>;
			const isErrorShape =
				Boolean(record.error) ||
				"cause" in record ||
				(typeof record.message === "string" &&
					("code" in record || "domain" in record));
			if (isErrorShape) return undefined;
		}
		return result;
	} catch (error) {
		logger.warn("Could not backfill approval preview", {
			event: "leaf.approval_preview_backfill_failed",
			tool: toolName,
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return undefined;
	}
};
