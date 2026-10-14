import type { createTool } from "@mastra/core/tools";
import type * as z from "zod/v4";
import { instrumentToolsWithAnalytics } from "../analytics/index.js";
import { domainModules, toolDomains } from "./domains.js";
import { createInvoiceTools } from "./invoices.js";
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
	invoices,
	logs,
	stripe,
} = domainModules;

export {
	dateToEpochMillisecondsTool,
	epochMillisecondsToDateTool,
} from "./utils/dates.js";

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
	...invoices.endpoints,
	...logs.endpoints,
	...stripe.endpoints,
} as const;

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
	...invoices.schemas,
	...logs.schemas,
	...stripe.schemas,
} as const satisfies Record<
	keyof typeof endpointByTool | "previewCreateBalance",
	z.ZodType
>;

const BILLING_PREVIEW_EXPAND = ["incoming.plan", "outgoing.plan"];

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

const createRawAutumnOperationToolset = ({
	requireIntent,
}: {
	requireIntent: boolean;
}): ToolRecord => {
	const operationTools: ToolRecord = {
		...toTools(operations, operationTool),
		...toTools(billingPreviews, (config) =>
			operationTool({
				...config,
				endpoint: config.previewEndpoint,
				expand: BILLING_PREVIEW_EXPAND,
			}),
		),
		...toTools(localPreviews, rawLocalPreviewTool),
		...toTools(confirmedWrites, operationTool),
		...createOrgTools(),
		...createInvoiceTools(),
	};
	return {
		...attachIntentToTools({ required: requireIntent, tools: operationTools }),
		dateToEpochMilliseconds: dateToEpochMillisecondsTool,
		epochMillisecondsToDate: epochMillisecondsToDateTool,
	};
};

export const createRawAutumnOperationTools = ({
	requireIntent = true,
}: {
	requireIntent?: boolean;
} = {}) =>
	instrumentToolsWithAnalytics({
		tools: createRawAutumnOperationToolset({ requireIntent }),
		surface: "mcp",
	});
