import { mergeAgentRules, type PartialAgentRules } from "@autumn/shared";
import { customers } from "../../fixtures/customers/index.js";
import { entities } from "../../fixtures/entities/index.js";
import { responses } from "../../fixtures/responses.js";
import type { EvalSetup } from "../../fixtures/types.js";
import type { EvalTrace } from "../tracing/types.js";
import type { AutumnApiMock, AutumnApiMockOverrides } from "./types.js";

const serverURL = "http://localhost:8080";

const endpointToTool = {
	"/v1/balances.create": "createBalance",
	"/v1/agent.get_rules": "getAgentRules",
	"/v1/agent.update_rules": "updateAgentRules",
	"/v1/billing.attach": "attach",
	"/v1/billing.create_schedule": "createSchedule",
	"/v1/billing.preview_attach": "previewAttach",
	"/v1/billing.preview_create_schedule": "previewCreateSchedule",
	"/v1/customers.get": "getCustomer",
	"/v1/customers.get_or_create": "getOrCreateCustomer",
	"/v1/customers.list": "listCustomers",
	"/v1/customers.update": "updateCustomer",
	"/v1/entities.create": "createEntity",
	"/v1/entities.get": "getEntity",
	"/v1/entities.list": "listEntities",
	"/v1/features.list": "listFeatures",
	"/v1/organization/me": "getCurrentOrganization",
	"/v1/plans.get": "getPlan",
	"/v1/plans.list": "listPlans",
} as const;

const getString = (body: Record<string, unknown>, key: string) =>
	typeof body[key] === "string" ? body[key] : "";

// Cursor pagination mirroring the real list endpoints: opaque base64url
// cursor, `{ list, next_cursor }` response with next_cursor null on the last
// page. The real API serves up to 1000 rows per page; the mock caps pages at
// 50 regardless of the requested limit so multi-page cursor behavior is
// exercisable with small fixtures — the contract the agent must honor (follow
// next_cursor until null) is the same.
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 50;

const decodeCursorOffset = (cursor: string) => {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		) as { offset?: unknown };
		return typeof parsed.offset === "number" ? parsed.offset : 0;
	} catch {
		return 0;
	}
};

const encodeCursorOffset = (offset: number) =>
	Buffer.from(JSON.stringify({ offset, v: 0 }), "utf8").toString("base64url");

const paginate = <Item>({
	body,
	items,
}: {
	body: Record<string, unknown>;
	items: Item[];
}) => {
	const requestedLimit =
		typeof body.limit === "number" ? body.limit : DEFAULT_PAGE_LIMIT;
	const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_LIMIT);
	const offset = decodeCursorOffset(getString(body, "start_cursor"));
	const nextOffset = offset + limit;
	return {
		list: items.slice(offset, nextOffset),
		next_cursor:
			nextOffset < items.length ? encodeCursorOffset(nextOffset) : null,
	};
};

const parseParenthesizedEpoch = (value: string) => {
	const epoch = value.match(/\((\d{12,})\)/)?.[1];
	return epoch ? Number(epoch) : value;
};

const normalizeScheduleBody = (body: Record<string, unknown>) => ({
	...body,
	phases: Array.isArray(body.phases)
		? body.phases.map((phase) =>
				phase && typeof phase === "object" && "starts_at" in phase
					? {
							...phase,
							starts_at:
								typeof phase.starts_at === "string"
									? parseParenthesizedEpoch(phase.starts_at)
									: phase.starts_at,
						}
					: phase,
			)
		: body.phases,
});

// The real API rejects entity ids the customer does not have.
const findAttachEntityError = ({
	body,
	customerId,
	setup,
}: {
	body: Record<string, unknown>;
	customerId: string | null;
	setup: EvalSetup;
}) => {
	const entityId = getString(body, "entity_id");
	if (!entityId) return null;
	const entity = setup.entities.find(
		(entity) => entity.id === entityId && entity.customer_id === customerId,
	);
	return entity ? null : { error: `entity ${entityId} not found for customer` };
};

const defaultHandlers = {
	attach: ({ body, setup }) => {
		const customer = setup.customers.find(
			(customer) => customer.id === getString(body, "customer_id"),
		);
		const plan = setup.plans.find(
			(plan) => plan.id === getString(body, "plan_id"),
		);
		if (!customer || !plan) return { error: "missing customer or plan" };
		const entityError = findAttachEntityError({
			body,
			customerId: customer.id,
			setup,
		});
		if (entityError) return entityError;
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
		return responses.attachSuccess({ customer, plan, request: body });
	},
	createBalance: () => ({ status: "created" }),
	createEntity: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const featureId = getString(body, "feature_id");
		const customer = setup.customers.find(
			(customer) => customer.id === customerId,
		);
		const feature = setup.features.find((feature) => feature.id === featureId);
		if (!customer || !feature) return { error: "missing customer or feature" };
		const existing = setup.entities.find(
			(entity) =>
				entity.customer_id === customerId &&
				entity.id === getString(body, "entity_id"),
		);
		if (existing) return existing;
		const created = entities.base({
			customer,
			feature,
			id: getString(body, "entity_id"),
			name: getString(body, "name") || getString(body, "entity_id"),
		});
		setup.entities.push(created);
		return created;
	},
	createSchedule: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const customer = setup.customers.find(
			(customer) => customer.id === customerId,
		);
		if (!customer) return { error: "customer not found" };
		return responses.createScheduleSuccess({
			customerId,
			entityId: getString(body, "entity_id") || null,
			phases: body.phases,
		});
	},
	getCustomer: ({ body, setup }) => {
		const customer = setup.customers.find(
			(customer) => customer.id === getString(body, "customer_id"),
		);
		return customer ?? { error: "customer not found" };
	},
	getEntity: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const entity = setup.entities.find(
			(entity) =>
				entity.id === getString(body, "entity_id") &&
				(!customerId || entity.customer_id === customerId),
		);
		return entity ?? { error: "entity not found" };
	},
	getAgentRules: ({ setup }) => setup.agentRules,
	getCurrentOrganization: () => ({
		env: "sandbox",
		name: "Acme Knowledge Systems",
		slug: "acme-knowledge-systems",
	}),
	getOrCreateCustomer: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const customer = setup.customers.find(
			(customer) => customer.id === customerId,
		);
		if (customer) return customer;

		const created = customers.active({
			email: getString(body, "email") || undefined,
			id: customerId,
			name: getString(body, "name") || undefined,
		});
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
		const matches = search
			? setup.customers.filter((customer) =>
					[customer.id, customer.name, customer.email].some(
						(value) =>
							typeof value === "string" && value.toLowerCase().includes(search),
					),
				)
			: setup.customers;

		return paginate({ body, items: matches });
	},
	listEntities: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const search = getString(body, "search").toLowerCase();
		const matches = setup.entities.filter((entity) => {
			const matchesCustomer = customerId
				? entity.customer_id === customerId
				: true;
			const matchesSearch = search
				? [entity.id, entity.name].some(
						(value) =>
							typeof value === "string" && value.toLowerCase().includes(search),
					)
				: true;
			return matchesCustomer && matchesSearch;
		});

		return paginate({ body, items: matches });
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
		const entityError = findAttachEntityError({
			body,
			customerId: customer.id,
			setup,
		});
		if (entityError) return entityError;
		return responses.attachPreview({ customer, plan, request: body });
	},
	previewCreateSchedule: ({ body, setup }) => {
		const customerId = getString(body, "customer_id");
		const customer = setup.customers.find(
			(customer) => customer.id === customerId,
		);
		if (!customer) return { error: "customer not found" };
		return responses.createSchedulePreview({
			customerId,
			phases: body.phases,
		});
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
	updateAgentRules: ({ body, setup }) => {
		setup.agentRules = mergeAgentRules({
			base: setup.agentRules,
			updates: body as PartialAgentRules,
		});
		return setup.agentRules;
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
		const rawBody = JSON.parse(String(init?.body ?? "{}"));
		const body =
			toolName === "previewCreateSchedule" || toolName === "createSchedule"
				? normalizeScheduleBody(rawBody)
				: rawBody;
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
