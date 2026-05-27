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
	{
		id: "previewAttach",
		description:
			"Preview attaching a plan to a customer. Does not modify billing state.",
		schema: AttachParamsV1Schema,
		endpoint: endpointByTool.previewAttach,
	},
	{
		id: "previewUpdateSubscription",
		description:
			"Preview updating a subscription. Does not modify billing state.",
		schema: UpdateSubscriptionV1ParamsSchema,
		endpoint: endpointByTool.previewUpdateSubscription,
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

export const createAutumnOperationTools = () => ({
	...Object.fromEntries(
		toolConfigs.map((config) => [config.id, operationTool(config)]),
	),
	// ...createAxiomTools(), leave out axiom investigate tool for now
	createBillingConfirmation: createTool({
		id: "createBillingConfirmation",
		description:
			"Create an internal pending billing action after previewing a billing write.",
		inputSchema: z
			.object({
				toolName: z.enum(["attach", "updateSubscription"]),
				request: z.union([
					AttachParamsV1Schema,
					UpdateSubscriptionV1ParamsSchema,
				]),
				preview: z.string(),
			})
			.strict(),
		execute: async ({ toolName, request, preview }, context) => {
			const parsedRequest = billingWriteSchemaByTool[toolName].parse(request);
			const pending = createPendingAction({
				auth: getAutumnAuth(context),
				toolName,
				request: parsedRequest,
				preview,
			});
			return {
				pending: true,
				expires_at: new Date(pending.expiresAt).toISOString(),
				message:
					"Preview ready. Ask the user to explicitly apply or approve this exact change. Do not mention internal ids or server bookkeeping details.",
			};
		},
	}),
	confirmBillingAction: createTool({
		id: "confirmBillingAction",
		description:
			"Apply the latest pending billing action after the user semantically confirms the preview.",
		inputSchema: z.object({}).strict(),
		execute: async (_input, context) => {
			const auth = getAutumnAuth(context);
			const action = claimLatestPendingAction(auth);
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
