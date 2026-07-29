import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { claimLatestPendingAction } from "../agent/pending-actions.js";
import { instrumentToolsWithAnalytics } from "../analytics/index.js";
import { type AutumnMcpAuth, getAutumnAuth } from "../server/auth/auth.js";
import { domainModules, toolDomains } from "./domains.js";
import { orgTools } from "./org.js";
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
import type { ConfirmedWriteToolName } from "./utils/types.js";

const {
	agent,
	customers,
	entities,
	features,
	plans,
	catalog,
	billing,
	balances,
	logs,
} = domainModules;

export {
	dateToEpochMillisecondsTool,
	epochMillisecondsToDateTool,
} from "./utils/dates.js";

/** Endpoint each tool calls, keyed by tool id (preview tools use their preview path). */
export const endpointByTool = {
	...agent.endpoints,
	...customers.endpoints,
	...entities.endpoints,
	...features.endpoints,
	...plans.endpoints,
	...catalog.endpoints,
	...billing.endpoints,
	...balances.endpoints,
	...logs.endpoints,
} as const;

/** Request schema each tool validates against, keyed by tool id. */
export const schemaByTool = {
	...agent.schemas,
	...customers.schemas,
	...entities.schemas,
	...features.schemas,
	...plans.schemas,
	...catalog.schemas,
	...billing.schemas,
	...balances.schemas,
	...logs.schemas,
} as const satisfies Record<
	keyof typeof endpointByTool | "previewCreateBalance",
	z.ZodType
>;

const operations = toolDomains.flatMap((domain) => domain.operations ?? []);
const billingPreviews = toolDomains.flatMap(
	(domain) => domain.billingPreviews ?? [],
);
const localPreviews = toolDomains.flatMap(
	(domain) => domain.localPreviews ?? [],
);
const confirmedWrites = toolDomains.flatMap(
	(domain) => domain.confirmedWrites ?? [],
);

type ToolRecord = Record<string, ReturnType<typeof createTool>>;

/**
 * Public MCP toolset: previews call Autumn's preview endpoints directly and
 * writes apply immediately (external clients gate destructive calls themselves).
 */
const createRawAutumnOperationToolset = ({
	requireIntent,
}: {
	requireIntent: boolean;
}): ToolRecord => {
	const operationTools: ToolRecord = {
		...toTools(operations, operationTool),
		...toTools(billingPreviews, (config) =>
			operationTool({ ...config, endpoint: config.previewEndpoint }),
		),
		...toTools(localPreviews, rawLocalPreviewTool),
		...toTools(confirmedWrites, operationTool),
		...orgTools,
	};
	return {
		...(requireIntent ? requireIntentOnTools(operationTools) : operationTools),
		dateToEpochMilliseconds: dateToEpochMillisecondsTool,
		epochMillisecondsToDate: epochMillisecondsToDateTool,
	};
};

/**
 * Build the Autumn MCP toolset. `requireIntent` (default true) forces a
 * one-sentence `intent` on every external tool call for analytics — disable it
 * for our own internal agent, which would otherwise fail when it omits it.
 */
export const createRawAutumnOperationTools = ({
	requireIntent = true,
}: {
	requireIntent?: boolean;
} = {}) =>
	instrumentToolsWithAnalytics({
		tools: createRawAutumnOperationToolset({ requireIntent }),
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
