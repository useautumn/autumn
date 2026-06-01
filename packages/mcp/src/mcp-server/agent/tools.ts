import {
	AttachParamsV1Schema,
	CreateBalanceParamsV0Schema,
	CreateCustomerParamsV1Schema,
	CreatePlanParamsV2Schema,
	CreateSchedulePhaseSchema,
	CreateScheduleParamsV0Schema,
	GetCustomerParamsV1Schema,
	GetPlanParamsV0Schema,
	ListCustomersV2_3ParamsSchema,
	ListPlanParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { createTool } from "@mastra/core/tools";
import { isValid, parseISO } from "date-fns";
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
	| "createSchedule"
	| "createBalance";
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
type LocalPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	writeToolName: ConfirmedWriteToolName;
	preview: (request: unknown) => unknown;
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
	createBalance: "/v1/balances.create",
} as const;

const epochMillisecondsSchema = z
	.union([z.number(), z.string()])
	.transform((value, context) => {
		if (typeof value === "number") {
			if (Number.isFinite(value)) return value;
		} else {
			const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
				? `${value}T00:00:00.000Z`
				: value;
			const hasExplicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);
			const parsed = parseISO(hasExplicitZone ? normalized : `${normalized}Z`);
			if (isValid(parsed)) return parsed.getTime();
		}

		context.addIssue({
			code: "custom",
			message:
				"Expected epoch milliseconds or an ISO date/timestamp string.",
		});
		return z.NEVER;
	});

const createSchedulePhaseMcpSchema = CreateSchedulePhaseSchema.extend({
	starts_at: epochMillisecondsSchema.meta({
		description:
			"Phase start time as epoch milliseconds or an ISO date string. Date-only values use midnight UTC.",
	}),
});

const createScheduleMcpSchema = CreateScheduleParamsV0Schema.extend({
	phases: z.tuple([createSchedulePhaseMcpSchema]).rest(
		createSchedulePhaseMcpSchema,
	),
});

const createBalanceMcpSchema = CreateBalanceParamsV0Schema.extend({
	expires_at: epochMillisecondsSchema.optional().meta({
		description:
			"Expiry time as epoch milliseconds or an ISO date string. Date-only values use midnight UTC.",
	}),
});

const writeSchemaByTool = {
	attach: AttachParamsV1Schema,
	updateSubscription: UpdateSubscriptionV1ParamsSchema,
	createPlan: CreatePlanParamsV2Schema,
	createSchedule: createScheduleMcpSchema,
	createBalance: createBalanceMcpSchema,
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
	previewCreateSchedule: createScheduleMcpSchema,
	createSchedule: createScheduleMcpSchema,
	previewCreateBalance: createBalanceMcpSchema,
	createBalance: createBalanceMcpSchema,
} as const satisfies Record<
	keyof typeof endpointByTool | "previewCreateBalance",
	z.ZodType
>;

const toolConfigs: OperationToolConfig[] = [
	{
		id: "listCustomers",
		description:
			"List Autumn customers. Use search, plans, subscription_status, and processors filters for customer-heavy queries; 'live', 'paying', and active subscribers usually mean subscription_status active. When a plan is named, include the plans filter instead of listing broad customer sets. If listPlans returned matching versions, pass only those versions in plans[].versions, never invent versions. For every/all/complete requests, paginate by calling again with start_cursor set to the previous response's next_cursor until next_cursor is empty.",
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
			"List Autumn plans. This is usually a cheap full scan; filter returned plans locally and use matching id/version pairs before customer queries based on plan attributes.",
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
		id: "createBalance",
		description:
			"Create a standalone customer balance grant. Use when a user asks to give, add, grant, or provision credits/balance to a customer or entity. Destructive: preview first; use entity_id for entity-scoped credits, included_grant for the grant amount, expires_at for expiring grants, and omit reset when using expires_at. For relative expiries like '2 months', use calendar months, not a 30-day approximation. expires_at accepts epoch milliseconds or ISO/date strings.",
		schema: createBalanceMcpSchema,
		endpoint: endpointByTool.createBalance,
		destructive: true,
	},
	{
		id: "getPlan",
		description: "Fetch one Autumn plan by id and optional version.",
		schema: GetPlanParamsV0Schema,
		endpoint: endpointByTool.getPlan,
	},
];

const localPreviewConfigs: LocalPreviewToolConfig[] = [
	{
		id: "previewCreateBalance",
		description:
			"Preview a standalone balance grant before createBalance. Use when a user asks to give, add, grant, or provision credits/balance to a customer or entity. Use for one-time credit grants, referral/promotional credits, and entity-scoped credits. Does not mutate Autumn. For relative expiries like '2 months', use calendar months. expires_at accepts epoch milliseconds or ISO/date strings.",
		schema: createBalanceMcpSchema,
		writeToolName: "createBalance",
		preview: (request) => ({
			action: "createBalance",
			request,
			impact:
				"Creates a standalone balance grant. If entity_id is present, the balance is scoped to that entity. If expires_at is present, the grant expires at that timestamp.",
		}),
	},
];

const billingPreviewConfigs: BillingPreviewToolConfig[] = [
	{
		id: "previewAttach",
		description:
			"Preview attaching a plan before attach. Include feature_quantities and custom items/prices; map recurring custom grants like 'per month/year' to reset.interval.",
		schema: AttachParamsV1Schema,
		previewEndpoint: endpointByTool.previewAttach,
		writeToolName: "attach",
	},
	{
		id: "previewUpdateSubscription",
		description:
			"Preview updating a subscription before updateSubscription. Include quantity/custom item changes; recurring custom grants need reset.interval.",
		schema: UpdateSubscriptionV1ParamsSchema,
		previewEndpoint: endpointByTool.previewUpdateSubscription,
		writeToolName: "updateSubscription",
	},
	{
		id: "previewCreateSchedule",
		description:
			"Preview billing impact of a multi-phase schedule before createSchedule. starts_at accepts epoch milliseconds or ISO/date strings; preserve exact calendar dates from the user or contract. Use redirect_mode if_required unless the user explicitly asks to disable checkout/redirects. If changing an existing/customer contract schedule, inspect the customer first. For schedules, put phase-specific feature quantities and contract feature limits/overrides in plan.customize.items, not feature_quantities; map 'per month/year' to reset.interval month/year. If the user says year 1 is already paid or should have no billing changes, do not add a year-1 phase; start phases at the first future billing change.",
		schema: createScheduleMcpSchema,
		previewEndpoint: endpointByTool.previewCreateSchedule,
		writeToolName: "createSchedule",
	},
];

const confirmedWriteConfigs: OperationToolConfig[] = [
	{
		id: "attach",
		description:
			"Attach a plan to a customer. Destructive: preview first; preserve feature_quantities, custom prices/items, reset intervals, discounts, and checkout behavior.",
		schema: AttachParamsV1Schema,
		endpoint: endpointByTool.attach,
		destructive: true,
	},
	{
		id: "updateSubscription",
		description:
			"Update a subscription. Destructive: preview first; preserve quantity/custom item changes and reset intervals from the previewed request.",
		schema: UpdateSubscriptionV1ParamsSchema,
		endpoint: endpointByTool.updateSubscription,
		destructive: true,
	},
	{
		id: "createSchedule",
		description:
			"Create a multi-phase billing schedule. Destructive: preview first; preserve phase starts_at and redirect_mode values from the previewed request. Use redirect_mode if_required unless the user explicitly asks to disable checkout/redirects. If changing an existing/customer contract schedule, inspect the customer first. For schedules, put phase-specific feature quantities and contract feature limits/overrides in plan.customize.items, not feature_quantities. If year 1 is already paid/no billing changes, do not add a year-1 phase; start at the first future billing change.",
		schema: createScheduleMcpSchema,
		endpoint: endpointByTool.createSchedule,
		destructive: true,
	},
];

export const dateToEpochMillisecondsTool = createTool({
	id: "dateToEpochMilliseconds",
	description:
		"Convert a calendar date or ISO timestamp to UTC epoch milliseconds for API timestamp fields. Date-only values default to midnight UTC; include an explicit offset in the date string when timezone matters.",
	inputSchema: z
		.object({
			date: z.string(),
		})
		.strict(),
	execute: async ({ date }) => toEpochMilliseconds(date),
});

const toEpochMilliseconds = (date: string) => {
	const normalized = /^\d{4}-\d{2}-\d{2}$/.test(date)
		? `${date}T00:00:00.000`
		: date;
	const hasExplicitZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);
	const parsed = parseISO(hasExplicitZone ? normalized : `${normalized}Z`);

	if (!isValid(parsed)) throw new Error(`Invalid date: ${date}`);
	return parsed.getTime();
};

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
				request: schema.parse((input as { request: unknown }).request),
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
			const parsedRequest = schema.parse(request);
			const auth = getAutumnAuth(context);
			logTool("preview-start", { previewTool: id, writeToolName });
			const preview = await callAutumn({
				context,
				endpoint: previewEndpoint,
				request: parsedRequest,
			});
			await createPendingAction({
				auth,
				toolName: writeToolName,
				request: parsedRequest,
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

const rawLocalPreviewTool = ({
	id,
	description,
	schema,
	preview,
}: LocalPreviewToolConfig) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: {
			annotations: mcpAnnotations(),
		},
		execute: async (input) =>
			preview(schema.parse((input as { request: unknown }).request)),
	});

const agentLocalPreviewTool = ({
	id,
	description,
	schema,
	writeToolName,
	preview,
}: LocalPreviewToolConfig) =>
	createTool({
		id,
		description: `${description} Store the exact pending billing action for later confirmation.`,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: {
			annotations: mcpAnnotations(),
		},
		execute: async (input, context) => {
			const request = (input as { request: unknown }).request;
			const parsedRequest = schema.parse(request);
			const previewResult = preview(parsedRequest);
			await createPendingAction({
				auth: getAutumnAuth(context),
				toolName: writeToolName,
				request: parsedRequest,
				preview: JSON.stringify(previewResult),
			});
			return {
				preview: previewResult,
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
			const parsedRequest = schema.parse(request);
			await createPendingAction({
				auth: getAutumnAuth(context),
				toolName: id as ConfirmedWriteToolName,
				request: parsedRequest,
				preview: JSON.stringify(parsedRequest),
			});
			return {
				pending: true,
				request: parsedRequest,
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
	...toTools(localPreviewConfigs, rawLocalPreviewTool),
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
	...toTools(localPreviewConfigs, agentLocalPreviewTool),
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
