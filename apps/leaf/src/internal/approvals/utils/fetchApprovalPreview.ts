import type { AutumnLogger } from "@autumn/logging";
import { parsePreviewPayload } from "@autumn/render";
import type { AppEnv } from "@autumn/shared";
import { errorMessage } from "../../../lib/errorMessage.js";
import type { WithheldWrite } from "../../agentRuntime/eve/parkedInput.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import {
	autumnMcpErrorText,
	rawErrorShapeText,
} from "../../autumnMcp/errorResult.js";
import {
	resolveApprovalDisplay,
	withApprovalDisplay,
} from "./approvalDisplay.js";
import { isErrorResult } from "./approvalErrors.js";
import { writeToPreviewTool } from "./toolRegistry.js";
import { toolRequestFromArgs } from "./toolRequest.js";

export const FAILED_APPROVAL_PREVIEW = { failed: true } as const;

export const isFailedApprovalPreview = (preview: unknown) =>
	Boolean(
		preview &&
			typeof preview === "object" &&
			(preview as { failed?: unknown }).failed === true,
	);

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
	if (writeToPreviewTool(name) === "getInvoice") {
		return { invoice_id: request.invoice_id };
	}
	if (name === "createPlan") {
		return withCatalogDefaults({
			expand: ["plan"],
			plans: [request],
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
	if (name === "updateCatalog" && Array.isArray(request.plans)) {
		const expand = Array.isArray(request.expand) ? request.expand : [];
		return withCatalogDefaults({
			...request,
			expand: [...new Set([...expand, "plan"])],
			plans: (request.plans as Record<string, unknown>[]).map((plan) => ({
				...plan,
				include_variants: true,
				include_versions: true,
				variants: plan.variants ?? [],
			})),
		});
	}
	return request;
};

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
	logger: Pick<AutumnLogger, "debug" | "warn">;
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
		if (isErrorResult(result)) {
			logger.debug("Approval preview returned an error result", {
				data: { env },
				event: "leaf.approval_preview_failed",
				tool: toolName,
			});
			return FAILED_APPROVAL_PREVIEW;
		}
		return result;
	} catch (error) {
		logger.warn("Could not backfill approval preview", {
			data: { env, error: errorMessage(error) },
			event: "leaf.approval_preview_backfill_failed",
			tool: toolName,
		});
		return FAILED_APPROVAL_PREVIEW;
	}
};

export const resolveApprovalPreview = async ({
	env,
	executeTool,
	getToken,
	logger,
	preview,
	request,
	toolName,
}: {
	env: AppEnv;
	executeTool?: typeof executeAutumnMcpTool;
	getToken: () => Promise<string>;
	logger: Pick<AutumnLogger, "debug" | "warn">;
	preview: unknown;
	request?: Record<string, unknown>;
	toolName: string;
}) => {
	if (!request || !shouldRefreshApprovalPreview({ preview, toolName })) {
		return preview;
	}
	try {
		const fetchedPreview = await fetchApprovalPreview({
			env,
			executeTool,
			logger,
			request,
			token: await getToken(),
			toolName,
		});
		if (isFailedApprovalPreview(fetchedPreview)) {
			return preview ?? FAILED_APPROVAL_PREVIEW;
		}
		return fetchedPreview ? fetchedPreview : preview;
	} catch (error) {
		logger.warn("Could not backfill approval preview", {
			event: "leaf.approval_preview_backfill_failed",
			data: { env, error },
			tool: toolName,
		});
		return preview;
	}
};

export const withWritePreviews = async ({
	env,
	executeTool,
	getToken,
	logger,
	writes,
}: {
	env: AppEnv;
	executeTool?: typeof executeAutumnMcpTool;
	getToken: () => Promise<string>;
	logger: Pick<AutumnLogger, "debug" | "warn">;
	writes: ReadonlyArray<WithheldWrite>;
}): Promise<ReadonlyArray<WithheldWrite>> =>
	Promise.all(
		writes.map(async (write) => {
			const request = toolRequestFromArgs(write.input);
			const preview = parsePreviewPayload(
				await resolveApprovalPreview({
					env,
					executeTool,
					getToken,
					logger,
					preview: undefined,
					request,
					toolName: write.toolName,
				}),
			);
			const display = await resolveApprovalDisplay({
				env,
				getToken,
				preview,
				request,
			});
			return { ...write, preview: withApprovalDisplay({ display, preview }) };
		}),
	);
