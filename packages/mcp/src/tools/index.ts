import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { claimLatestPendingAction } from "../agent/pending-actions.js";
import { instrumentToolsWithAnalytics } from "../analytics/index.js";
import { type AutumnMcpAuth, getAutumnAuth } from "../server/auth/auth.js";
import { balances } from "./balances.js";
import { billing } from "./billing.js";
import { customers } from "./customers.js";
import { features } from "./features.js";
import { logs } from "./logs.js";
import { orgTools } from "./org.js";
import { plans } from "./plans.js";
import { callAutumn } from "./utils/client.js";
import {
	dateToEpochMillisecondsTool,
	epochMillisecondsToDateTool,
} from "./utils/dates.js";
import { logTool } from "./utils/debug.js";
import {
	agentBillingPreviewTool,
	agentLocalPreviewTool,
	agentPendingWriteTool,
	operationTool,
	rawLocalPreviewTool,
	toTools,
} from "./utils/factories.js";
import { requireIntentOnTools } from "./utils/intent.js";
import type { ConfirmedWriteToolName, ToolDomain } from "./utils/types.js";

export {
	dateToEpochMillisecondsTool,
	epochMillisecondsToDateTool,
} from "./utils/dates.js";

/** Endpoint each tool calls, keyed by tool id (preview tools use their preview path). */
export const endpointByTool = {
	...customers.endpoints,
	...features.endpoints,
	...plans.endpoints,
	...billing.endpoints,
	...balances.endpoints,
	...logs.endpoints,
} as const;

/** Request schema each tool validates against, keyed by tool id. */
export const schemaByTool = {
	...customers.schemas,
	...features.schemas,
	...plans.schemas,
	...billing.schemas,
	...balances.schemas,
	...logs.schemas,
} as const satisfies Record<
	keyof typeof endpointByTool | "previewCreateBalance",
	z.ZodType
>;

const domains: ToolDomain[] = [
	customers.domain,
	features.domain,
	plans.domain,
	billing.domain,
	balances.domain,
	logs.domain,
];
const operations = domains.flatMap((domain) => domain.operations ?? []);
const billingPreviews = domains.flatMap(
	(domain) => domain.billingPreviews ?? [],
);
const localPreviews = domains.flatMap((domain) => domain.localPreviews ?? []);
const confirmedWrites = domains.flatMap(
	(domain) => domain.confirmedWrites ?? [],
);

type ToolRecord = Record<string, ReturnType<typeof createTool>>;

/**
 * Public MCP toolset: previews call Autumn's preview endpoints directly and
 * writes apply immediately (external clients gate destructive calls themselves).
 */
const createRawAutumnOperationToolset = (): ToolRecord => ({
	...requireIntentOnTools({
		...toTools(operations, operationTool),
		...toTools(billingPreviews, (config) =>
			operationTool({ ...config, endpoint: config.previewEndpoint }),
		),
		...toTools(localPreviews, rawLocalPreviewTool),
		...toTools(confirmedWrites, operationTool),
		...orgTools,
	} as ToolRecord),
	dateToEpochMilliseconds: dateToEpochMillisecondsTool,
	epochMillisecondsToDate: epochMillisecondsToDateTool,
});

export const createRawAutumnOperationTools = () =>
	instrumentToolsWithAnalytics({
		// Require a one-sentence `intent` on every external tool call so we can
		// see what clients are actually trying to do (captured in analytics).
		tools: createRawAutumnOperationToolset(),
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
const createAgentAutumnOperationToolset = (): ToolRecord => ({
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
	epochMillisecondsToDate: epochMillisecondsToDateTool,
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
