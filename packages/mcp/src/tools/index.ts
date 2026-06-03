import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { claimLatestPendingAction } from "../agent/pending-actions.js";
import { instrumentToolsWithAnalytics } from "../analytics/index.js";
import { type AutumnMcpAuth, getAutumnAuth } from "../server/auth/auth.js";
import { balances } from "./balances.js";
import { billing } from "./billing.js";
import { customers } from "./customers.js";
import { plans } from "./plans.js";
import { callAutumn } from "./utils/client.js";
import { dateToEpochMillisecondsTool } from "./utils/dates.js";
import { logTool } from "./utils/debug.js";
import {
	agentBillingPreviewTool,
	agentLocalPreviewTool,
	agentPendingWriteTool,
	operationTool,
	rawLocalPreviewTool,
	toTools,
} from "./utils/factories.js";
import type { ConfirmedWriteToolName, ToolDomain } from "./utils/types.js";

export { dateToEpochMillisecondsTool } from "./utils/dates.js";

/** Endpoint each tool calls, keyed by tool id (preview tools use their preview path). */
export const endpointByTool = {
	...customers.endpoints,
	...plans.endpoints,
	...billing.endpoints,
	...balances.endpoints,
} as const;

/** Request schema each tool validates against, keyed by tool id. */
export const schemaByTool = {
	...customers.schemas,
	...plans.schemas,
	...billing.schemas,
	...balances.schemas,
} as const satisfies Record<
	keyof typeof endpointByTool | "previewCreateBalance",
	z.ZodType
>;

const domains: ToolDomain[] = [
	customers.domain,
	plans.domain,
	billing.domain,
	balances.domain,
];
const operations = domains.flatMap((domain) => domain.operations ?? []);
const billingPreviews = domains.flatMap(
	(domain) => domain.billingPreviews ?? [],
);
const localPreviews = domains.flatMap((domain) => domain.localPreviews ?? []);
const confirmedWrites = domains.flatMap(
	(domain) => domain.confirmedWrites ?? [],
);

/**
 * Public MCP toolset: previews call Autumn's preview endpoints directly and
 * writes apply immediately (external clients gate destructive calls themselves).
 */
export const createRawAutumnOperationTools = () =>
	instrumentToolsWithAnalytics({
		tools: {
			...toTools(operations, operationTool),
			...toTools(billingPreviews, (config) =>
				operationTool({ ...config, endpoint: config.previewEndpoint }),
			),
			...toTools(localPreviews, rawLocalPreviewTool),
			...toTools(confirmedWrites, operationTool),
		},
		surface: "mcp",
	});

/** Applies a previously-staged billing write after the user confirms it. */
export const executeConfirmedBillingAction = ({
	auth,
	toolName,
	request,
}: {
	auth: AutumnMcpAuth;
	toolName: ConfirmedWriteToolName;
	request: unknown;
}) =>
	callAutumn({
		auth,
		endpoint: endpointByTool[toolName],
		request: schemaByTool[toolName].parse(request),
	});

/**
 * Agent toolset: destructive operations and billing writes are staged as pending
 * actions (preview-first), then applied via `confirmBillingAction` once approved.
 */
const createAgentAutumnOperationToolset = () => ({
	...toTools(
		operations.filter(({ destructive }) => !destructive),
		operationTool,
	),
	...toTools(
		operations.filter(({ destructive }) => destructive),
		agentPendingWriteTool,
	),
	...toTools(billingPreviews, agentBillingPreviewTool),
	...toTools(localPreviews, agentLocalPreviewTool),
	dateToEpochMilliseconds: dateToEpochMillisecondsTool,
	confirmBillingAction: createTool({
		id: "confirmBillingAction",
		description:
			"Apply the latest pending billing action after the user semantically confirms the preview.",
		inputSchema: z.object({}).strict(),
		execute: async (_input, context) => {
			const auth = getAutumnAuth(context);
			logTool("confirm-start", { env: auth.env });
			const action = await claimLatestPendingAction(auth);
			logTool("confirm-claimed", { toolName: action.toolName });
			const result = await executeConfirmedBillingAction({
				auth,
				toolName: action.toolName,
				request: action.request,
			});
			return {
				message: `Confirmed and applied ${action.toolName}.`,
				result,
			};
		},
	}),
});

export const createAgentAutumnOperationTools = () =>
	instrumentToolsWithAnalytics({
		tools: createAgentAutumnOperationToolset(),
		surface: "agent",
	});
