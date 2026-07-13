import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { normalizeToolName } from "../../../agent/tools/toolPolicy.js";
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
	const name = normalizeToolName(toolName);
	if (name === "updatePlan") {
		return {
			expand: ["plan"],
			plans: [
				{
					...request,
					include_variants: true,
					include_versions: true,
				},
			],
			skip_deletions: true,
		};
	}
	// Catalog updates need the variant/version previews for the decision gate,
	// and the model rarely passes the flags itself.
	if (name === "updateCatalog" && Array.isArray(request.plans)) {
		return {
			...request,
			plans: (request.plans as Record<string, unknown>[]).map((plan) => ({
				...plan,
				include_variants: true,
				include_versions: true,
				// The MCP input schema requires `variants` once include flags are
				// set; an empty list is a no-op for preview purposes.
				variants: plan.variants ?? [],
			})),
		};
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
		// A failed preview (validation, 404 pre-creation, API 4xx) must not
		// become the card's "preview" — the card falls back to params-only.
		// Failures arrive either as { error: true, ... } or as a thrown-error
		// envelope { message, code, domain/category, cause }.
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
