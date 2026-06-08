import { customers } from "../../fixtures/customers/index.js";
import { responses } from "../../fixtures/responses.js";
import type { EvalTrace } from "../tracing/types.js";
import type { AutumnApiMock, AutumnApiMockOverrides } from "./types.js";

const serverURL = "http://localhost:8080";

const endpointToTool = {
	"/v1/balances.create": "createBalance",
	"/v1/billing.attach": "attach",
	"/v1/billing.preview_attach": "previewAttach",
	"/v1/customers.get": "getCustomer",
	"/v1/customers.get_or_create": "getOrCreateCustomer",
	"/v1/customers.list": "listCustomers",
	"/v1/customers.update": "updateCustomer",
	"/v1/features.list": "listFeatures",
	"/v1/plans.get": "getPlan",
	"/v1/plans.list": "listPlans",
} as const;

const getString = (body: Record<string, unknown>, key: string) =>
	typeof body[key] === "string" ? body[key] : "";

const defaultHandlers = {
	attach: ({ body, setup }) => {
		const customer = setup.customers.find(
			(customer) => customer.id === getString(body, "customer_id"),
		);
		const plan = setup.plans.find(
			(plan) => plan.id === getString(body, "plan_id"),
		);
		if (!customer || !plan) return { error: "missing customer or plan" };
		customer.subscriptions = [
			...customer.subscriptions,
			{
				add_on: plan.add_on,
				auto_enable: plan.auto_enable,
				canceled_at: null,
				current_period_end: null,
				current_period_start: 1_767_225_600_000,
				expires_at: null,
				id: `sub_${plan.id}`,
				past_due: false,
				plan_id: plan.id,
				quantity: 1,
				started_at: 1_767_225_600_000,
				status: "active",
				trial_ends_at: null,
			},
		];
		return responses.attachSuccess({ customer, plan });
	},
	createBalance: () => ({ status: "created" }),
	getCustomer: ({ body, setup }) => {
		const customer = setup.customers.find(
			(customer) => customer.id === getString(body, "customer_id"),
		);
		return customer ?? { error: "customer not found" };
	},
	getOrCreateCustomer: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const customer = setup.customers.find(
			(customer) => customer.id === customerId,
		);
		if (customer) return customer;

		const created = customers.active({ id: customerId });
		setup.customers.push(created);
		return created;
	},
	getPlan: ({ body, setup }) => {
		const plan = setup.plans.find(
			(plan) => plan.id === getString(body, "plan_id"),
		);
		return plan ?? { error: "plan not found" };
	},
	listCustomers: ({ body, setup }) => {
		const search = getString(body, "search").toLowerCase();
		const list = search
			? setup.customers.filter((customer) =>
					[customer.id, customer.name, customer.email].some(
						(value) =>
							typeof value === "string" && value.toLowerCase().includes(search),
					),
				)
			: setup.customers;

		return {
			limit: list.length,
			list,
			offset: 0,
			total: setup.customers.length,
			total_count: setup.customers.length,
			total_filtered_count: list.length,
		};
	},
	listFeatures: ({ setup }) => ({ list: setup.features }),
	listPlans: ({ setup }) => ({
		list: setup.plans,
	}),
	previewAttach: ({ body, setup }) => {
		const customer = setup.customers.find(
			(customer) => customer.id === getString(body, "customer_id"),
		);
		const plan = setup.plans.find(
			(plan) => plan.id === getString(body, "plan_id"),
		);
		if (!customer || !plan) return { error: "missing customer or plan" };
		return responses.attachPreview({ customer, plan });
	},
	updateCustomer: ({ body, setup }) => {
		const customer = setup.customers.find(
			(customer) => customer.id === getString(body, "customer_id"),
		);
		if (!customer) return { error: "customer not found" };
		if (typeof body.email === "string") customer.email = body.email;
		if (typeof body.name === "string") customer.name = body.name;
		return customer;
	},
} satisfies AutumnApiMockOverrides;

export const createAutumnApiMock = ({
	overrides = {},
	setup,
	trace,
}: {
	overrides?: AutumnApiMockOverrides;
	setup: AutumnApiMock["setup"];
	trace?: EvalTrace;
}): AutumnApiMock => {
	const calls: AutumnApiMock["calls"] = [];
	const originalFetch = globalThis.fetch;
	const handlers = { ...defaultHandlers, ...overrides };

	globalThis.fetch = (async (input, init) => {
		const url = new URL(String(input));
		if (url.origin !== serverURL) return originalFetch(input, init);

		const endpoint = url.pathname;
		const toolName =
			endpointToTool[endpoint as keyof typeof endpointToTool] ?? null;
		const body = JSON.parse(String(init?.body ?? "{}"));
		const call = { body, endpoint, toolName };
		calls.push(call);
		trace?.event({ call, type: "api_call" });

		if (!toolName) {
			return Response.json(
				{ error: `Unhandled endpoint: ${endpoint}` },
				{ status: 500 },
			);
		}

		const handler = handlers[toolName];
		if (!handler) {
			return Response.json(
				{ error: `No handler for ${toolName}` },
				{ status: 500 },
			);
		}

		const response = handler({ body, setup });
		trace?.event({ endpoint, response, type: "api_response" });
		return Response.json(response);
	}) as typeof fetch;

	return {
		calls,
		restore: () => {
			globalThis.fetch = originalFetch;
		},
		serverURL,
		setup,
	};
};
