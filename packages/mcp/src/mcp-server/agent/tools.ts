import {
	AttachParamsV1Schema,
	CreateCustomerParamsV1Schema,
	CreatePlanParamsV2Schema,
	CreateScheduleParamsV0Schema,
	GetCustomerParamsV1Schema,
	GetPlanParamsV0Schema,
	ListCustomersV2_3ParamsSchema,
	ListPlanParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { createAutumnClient, getAutumnAuth } from "./auth.js";
import {
	claimLatestPendingAction,
	createPendingAction,
} from "./pending-actions.js";

type ToolContext = Parameters<
	NonNullable<ReturnType<typeof createTool>["execute"]>
>[1];
type ConfirmedWriteToolName =
	| "attach"
	| "updateSubscription"
	| "createPlan"
	| "createSchedule";
type OperationToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	endpoint: string;
	destructive?: boolean;
	idempotent?: boolean;
};
type BillingPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	previewEndpoint: string;
	writeToolName: ConfirmedWriteToolName;
};

export const endpointByTool = {
	listCustomers: "/v1/customers.list",
	createCustomer: "/v1/customers.get_or_create",
	getCustomer: "/v1/customers.get",
	listPlans: "/v1/plans.list",
	createPlan: "/v1/plans.create",
	getPlan: "/v1/plans.get",
	previewAttach: "/v1/billing.preview_attach",
	attach: "/v1/billing.attach",
	previewUpdateSubscription: "/v1/billing.preview_update",
	updateSubscription: "/v1/billing.update",
	previewCreateSchedule: "/v1/billing.preview_create_schedule",
	createSchedule: "/v1/billing.create_schedule",
} as const;

const writeSchemaByTool = {
	attach: AttachParamsV1Schema,
	updateSubscription: UpdateSubscriptionV1ParamsSchema,
	createPlan: CreatePlanParamsV2Schema,
	createSchedule: CreateScheduleParamsV0Schema,
} as const satisfies Record<ConfirmedWriteToolName, z.ZodType>;

export const schemaByTool = {
	listCustomers: ListCustomersV2_3ParamsSchema,
	createCustomer: CreateCustomerParamsV1Schema,
	getCustomer: GetCustomerParamsV1Schema,
	listPlans: ListPlanParamsSchema,
	createPlan: CreatePlanParamsV2Schema,
	getPlan: GetPlanParamsV0Schema,
	previewAttach: AttachParamsV1Schema,
	attach: AttachParamsV1Schema,
	previewUpdateSubscription: UpdateSubscriptionV1ParamsSchema,
	updateSubscription: UpdateSubscriptionV1ParamsSchema,
	previewCreateSchedule: CreateScheduleParamsV0Schema,
	createSchedule: CreateScheduleParamsV0Schema,
} as const satisfies Record<keyof typeof endpointByTool, z.ZodType>;

const toolConfigs: OperationToolConfig[] = [
	{
		id: "listCustomers",
		description:
			"List Autumn customers. Use search, plans, subscription_status, and processors filters for customer-heavy queries, and paginate for complete results.",
		schema: ListCustomersV2_3ParamsSchema,
		endpoint: endpointByTool.listCustomers,
	},
	{
		id: "createCustomer",
		description:
			"Create an Autumn customer, or return the existing customer with the same id. Use when the user explicitly wants a customer record created.",
		schema: CreateCustomerParamsV1Schema,
		endpoint: endpointByTool.createCustomer,
		idempotent: true,
	},
	{
		id: "getCustomer",
		description: "Fetch one Autumn customer by id.",
		schema: GetCustomerParamsV1Schema,
		endpoint: endpointByTool.getCustomer,
	},
	{
		id: "listPlans",
		description:
			"List Autumn plans. This is usually a cheap full scan; filter returned plans locally and use before customer queries based on plan attributes.",
		schema: ListPlanParamsSchema,
		endpoint: endpointByTool.listPlans,
	},
	{
		id: "createPlan",
		description:
			"Create an Autumn plan. Destructive configuration write: gather plan_id, name, price, features/items, trials, and confirmation before running.",
		schema: CreatePlanParamsV2Schema,
		endpoint: endpointByTool.createPlan,
		destructive: true,
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
			"Preview attaching a plan to a customer before any attach write.",
		schema: AttachParamsV1Schema,
		previewEndpoint: endpointByTool.previewAttach,
		writeToolName: "attach",
	},
	{
		id: "previewUpdateSubscription",
		description: "Preview updating a subscription before any update write.",
		schema: UpdateSubscriptionV1ParamsSchema,
		previewEndpoint: endpointByTool.previewUpdateSubscription,
		writeToolName: "updateSubscription",
	},
	{
		id: "previewCreateSchedule",
		description:
			"Preview the immediate billing impact of a multi-phase billing schedule before any createSchedule write.",
		schema: CreateScheduleParamsV0Schema,
		previewEndpoint: endpointByTool.previewCreateSchedule,
		writeToolName: "createSchedule",
	},
];

const confirmedWriteConfigs: OperationToolConfig[] = [
	{
		id: "attach",
		description:
			"Attach a plan to a customer. Destructive: call previewAttach first and only run after explicit user confirmation.",
		schema: AttachParamsV1Schema,
		endpoint: endpointByTool.attach,
		destructive: true,
	},
	{
		id: "updateSubscription",
		description:
			"Update a customer subscription. Destructive: call previewUpdateSubscription first and only run after explicit user confirmation.",
		schema: UpdateSubscriptionV1ParamsSchema,
		endpoint: endpointByTool.updateSubscription,
		destructive: true,
	},
	{
		id: "createSchedule",
		description:
			"Create a multi-phase billing schedule. Destructive billing write: resolve customer, plans, phase start times, and confirmation before running.",
		schema: CreateScheduleParamsV0Schema,
		endpoint: endpointByTool.createSchedule,
		destructive: true,
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

const mcpAnnotations = (destructive = false, idempotent = false) => ({
	readOnlyHint: !destructive && !idempotent,
	destructiveHint: destructive,
	idempotentHint: idempotent,
	openWorldHint: false,
});

const toTools = <Config extends { id: string }>(
	configs: Config[],
	create: (config: Config) => ReturnType<typeof createTool>,
) => Object.fromEntries(configs.map((config) => [config.id, create(config)]));

const operationTool = ({
	id,
	description,
	schema,
	endpoint,
	destructive = false,
	idempotent = false,
}: OperationToolConfig) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: {
			annotations: mcpAnnotations(destructive, idempotent),
		},
		execute: (input, context) =>
			callAutumn({
				context,
				endpoint,
				request: (input as { request: unknown }).request,
			}),
	});

const agentBillingPreviewTool = ({
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
	writeToolName: ConfirmedWriteToolName;
}) =>
	createTool({
		id,
		description: `${description} Store the exact pending billing action for later confirmation.`,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: {
			annotations: mcpAnnotations(),
		},
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

const agentPendingWriteTool = ({
	id,
	description,
	schema,
}: OperationToolConfig) =>
	createTool({
		id,
		description: `${description} This internal agent tool stores the exact request for later confirmation instead of applying it immediately.`,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: {
			annotations: mcpAnnotations(),
		},
		execute: async (input, context) => {
			const request = (input as { request: unknown }).request;
			await createPendingAction({
				auth: getAutumnAuth(context),
				toolName: id as ConfirmedWriteToolName,
				request,
				preview: JSON.stringify(request),
			});
			return {
				pending: true,
				request,
				message:
					"Request ready. Ask the user to explicitly apply or approve this exact change.",
			};
		},
	});

export const createRawAutumnOperationTools = () => ({
	...toTools(toolConfigs, operationTool),
	...toTools(billingPreviewConfigs, (config) =>
		operationTool({ ...config, endpoint: config.previewEndpoint }),
	),
	...toTools(confirmedWriteConfigs, operationTool),
});

export const createAgentAutumnOperationTools = () => ({
	...toTools(
		toolConfigs.filter(({ destructive }) => !destructive),
		operationTool,
	),
	...toTools(
		toolConfigs.filter(({ destructive }) => destructive),
		agentPendingWriteTool,
	),
	...toTools(billingPreviewConfigs, agentBillingPreviewTool),
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
	toolName: ConfirmedWriteToolName;
	request: unknown;
}) =>
	callAutumn({
		context: { mcp: { extra: { authInfo: auth } } } as never,
		endpoint: endpointByTool[toolName],
		request: writeSchemaByTool[toolName].parse(request),
	});
