import type { createTool } from "@mastra/core/tools";
import type * as z from "zod/v4";
import { instrumentToolsWithAnalytics } from "../analytics/index.js";
import { domainModules, toolDomains } from "./domains.js";
import { createOrgTools } from "./org.js";
import {
	dateToEpochMillisecondsTool,
	epochMillisecondsToDateTool,
} from "./utils/dates.js";
import {
	operationTool,
	rawLocalPreviewTool,
	toTools,
} from "./utils/factories.js";
import { attachIntentToTools } from "./utils/intent.js";

const {
	agent,
	customers,
	entities,
	features,
	plans,
	rewards,
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
	...rewards.endpoints,
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
	...rewards.schemas,
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
		...createOrgTools(),
	};
	return {
		...attachIntentToTools({ required: requireIntent, tools: operationTools }),
		dateToEpochMilliseconds: dateToEpochMillisecondsTool,
		epochMillisecondsToDate: epochMillisecondsToDateTool,
	};
};

/**
 * Build the Autumn MCP toolset. `requireIntent` (default true) forces a
 * one-sentence `intent` on every external tool call for analytics — disable it
 * for our own internal agent, which would otherwise fail when it omits it. Every
 * tool still accepts an intent either way.
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
