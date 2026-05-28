import {
	AttachParamsV1Schema,
	GetCustomerParamsV1Schema,
	GetPlanParamsV0Schema,
	ListCustomersV2_3ParamsSchema,
	ListPlanParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { createAutumnClient, getAutumnAuth } from "./auth.js";
import { createAxiomTools } from "./axiom.js";
import {
	claimLatestPendingAction,
	createPendingAction,
} from "./pending-actions.js";

type ToolContext = Parameters<
	NonNullable<ReturnType<typeof createTool>["execute"]>
>[1];
type BillingWriteToolName = "attach" | "updateSubscription";
type OperationToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	endpoint: string;
};
type BillingPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	previewEndpoint: string;
	writeToolName: BillingWriteToolName;
};

const endpointByTool = {
	listCustomers: "/v1/customers.list",
	getCustomer: "/v1/customers.get",
	listPlans: "/v1/plans.list",
	getPlan: "/v1/plans.get",
	previewAttach: "/v1/billing.preview_attach",
	attach: "/v1/billing.attach",
	previewUpdateSubscription: "/v1/billing.preview_update",
	updateSubscription: "/v1/billing.update",
} as const;

const billingWriteSchemaByTool = {
	attach: AttachParamsV1Schema,
	updateSubscription: UpdateSubscriptionV1ParamsSchema,
} as const satisfies Record<BillingWriteToolName, z.ZodType>;

const toolConfigs: OperationToolConfig[] = [
	{
		id: "listCustomers",
		description:
			"List Autumn customers. Use search to find a customer by id, name, or email.",
		schema: ListCustomersV2_3ParamsSchema,
		endpoint: endpointByTool.listCustomers,
	},
	{
		id: "getCustomer",
		description: "Fetch one Autumn customer by id.",
		schema: GetCustomerParamsV1Schema,
		endpoint: endpointByTool.getCustomer,
	},
	{
		id: "listPlans",
		description: "List Autumn plans.",
		schema: ListPlanParamsSchema,
		endpoint: endpointByTool.listPlans,
	},
	{
		id: "getPlan",
		description: "Fetch one Autumn plan by id and optional version.",
		schema: GetPlanParamsV0Schema,
		endpoint: endpointByTool.getPlan,
	},
];

const billingPreviewConfigs: BillingPreviewToolConfig[] = [
	{
		id: "previewAttach",
		description:
			"Preview attaching a plan to a customer and store the exact pending attach action for later confirmation.",
		schema: AttachParamsV1Schema,
		previewEndpoint: endpointByTool.previewAttach,
		writeToolName: "attach",
	},
	{
		id: "previewUpdateSubscription",
		description:
			"Preview updating a subscription and store the exact pending update action for later confirmation.",
		schema: UpdateSubscriptionV1ParamsSchema,
		previewEndpoint: endpointByTool.previewUpdateSubscription,
		writeToolName: "updateSubscription",
	},
];

const callAutumn = async ({
	context,
	endpoint,
	request,
}: {
	context?: ToolContext;
	endpoint: string;
	request: unknown;
}) => {
	const auth = getAutumnAuth(context);
	const client = createAutumnClient(auth);
	const init: RequestInit = {
		method: "POST",
		headers: client.headers,
		body: JSON.stringify(request),
	};
	if (context?.mcp?.extra?.signal) init.signal = context.mcp.extra.signal;
	const response = await fetch(new URL(endpoint, client.baseUrl), init);
	const text = await response.text();
	const body = text ? parseBody(text) : null;
	if (!response.ok) {
		throw new Error(
			`Autumn API request failed (${response.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`,
		);
	}
	return body;
};

const parseBody = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
const logTool = (event: string, data: Record<string, unknown>) => {
	if (process.env.MCP_DEBUG_PENDING_ACTIONS !== "1") return;
	console.log(`[mcp:agent-tools] ${event} ${JSON.stringify(data)}`);
};

const operationTool = <Schema extends z.ZodType>({
	id,
	description,
	schema,
	endpoint,
}: {
	id: string;
	description: string;
	schema: Schema;
	endpoint: string;
}) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		execute: (input, context) =>
			callAutumn({
				context,
				endpoint,
				request: (input as { request: z.infer<Schema> }).request,
			}),
	});

const billingPreviewTool = ({
	id,
	description,
	schema,
	previewEndpoint,
	writeToolName,
}: {
	id: string;
	description: string;
	schema: z.ZodType;
	previewEndpoint: string;
	writeToolName: BillingWriteToolName;
}) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		execute: async (input, context) => {
			const request = (input as { request: unknown }).request;
			const auth = getAutumnAuth(context);
			logTool("preview-start", { previewTool: id, writeToolName });
			const preview = await callAutumn({
				context,
				endpoint: previewEndpoint,
				request,
			});
			await createPendingAction({
				auth,
				toolName: writeToolName,
				request,
				preview: JSON.stringify(preview),
			});
			logTool("preview-stored", { previewTool: id, writeToolName });
			return {
				preview,
				pending: true,
				message:
					"Preview ready. Ask the user to explicitly apply or approve this exact change.",
			};
		},
	});

export const createAutumnOperationTools = () => ({
	...Object.fromEntries(
		toolConfigs.map((config) => [config.id, operationTool(config)]),
	),
	...Object.fromEntries(
		billingPreviewConfigs.map((config) => [
			config.id,
			billingPreviewTool(config),
		]),
	),
	// ...createAxiomTools(), leave out axiom investigate tool for now
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

export const executeConfirmedBillingAction = async ({
	auth,
	toolName,
	request,
}: {
	auth: ReturnType<typeof getAutumnAuth>;
	toolName: BillingWriteToolName;
	request: unknown;
}) =>
	callAutumn({
		context: { mcp: { extra: { authInfo: auth } } } as never,
		endpoint: endpointByTool[toolName],
		request: billingWriteSchemaByTool[toolName].parse(request),
	});
