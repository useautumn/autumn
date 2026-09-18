import { z } from "zod";
import { schemaByTool } from "../../../packages/mcp/src/tools/index.js";
import {
	getPlanItemDisplay,
	type PlanItemDisplayFeature,
} from "../../../shared/api/products/items/utils/display/planItemDisplay.js";
import { getPlanDisplay } from "../../../shared/api/products/utils/display/planDisplay.js";
import { slimToolSchema } from "../../leaf/agent/lib/toolSchemaSlim.js";
import type {
	AutumnMcpToolMetadata,
	JsonSchemaObject,
} from "../../leaf/src/internal/autumnMcp/rpcClient.js";
import type { ToolCall } from "./context.js";

const operations = [
	"attach",
	"updateSubscription",
	"createSchedule",
	"updateCustomer",
	"getOrCreateCustomer",
	"createEntity",
] as const;
const operationSchema = z.enum(operations);
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const records = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? value.map(record) : [];

export const buildProposalSchema = ({
	operations: selected,
	metadata,
}: {
	operations: string[];
	metadata: AutumnMcpToolMetadata[];
}): JsonSchemaObject => {
	const variants = [...new Set(selected)].map((name) => {
		operationSchema.parse(name);
		const tool = metadata.find((tool) => tool.name === name);
		const request = record(record(tool?.inputSchema.properties).request);
		if (!tool || !Object.keys(request).length)
			throw new Error(`Missing request schema for ${name}`);
		return {
			type: "object",
			properties: {
				operation: { type: "string", enum: [name] },
				request: slimToolSchema(request as JsonSchemaObject),
			},
			required: ["operation", "request"],
			additionalProperties: false,
		};
	});
	return {
		type: "object",
		properties: {
			status: {
				type: "string",
				enum: variants.length
					? ["proposal", "clarify", "answer"]
					: ["clarify", "answer"],
			},
			message: { type: "string" },
			actions: {
				type: "array",
				maxItems: variants.length ? 16 : 0,
				items: variants.length
					? { anyOf: variants }
					: { type: "object", additionalProperties: false },
			},
			unsupported_obligations: {
				type: "array",
				maxItems: 8,
				description:
					"Explicit user or contract obligations that no available operation field can represent and that therefore need human follow-up. Empty when everything requested is representable. Never list a term the operations can express.",
				items: {
					type: "object",
					properties: {
						obligation: { type: "string" },
						reason: { type: "string" },
					},
					required: ["obligation", "reason"],
					additionalProperties: false,
				},
			},
		},
		required: ["status", "message", "actions", "unsupported_obligations"],
		additionalProperties: false,
	};
};

const actionVariants = (schema: JsonSchemaObject): Record<string, unknown>[] => {
	const items = record(record(record(schema.properties).actions).items);
	return Array.isArray(items.anyOf) ? items.anyOf.map(record) : [];
};

const actionOperations = (schema: JsonSchemaObject): string[] =>
	actionVariants(schema).flatMap((variant) => {
		const operation = record(record(variant.properties).operation);
		return Array.isArray(operation.enum)
			? operation.enum.filter(
					(value): value is string => typeof value === "string",
				)
			: [];
	});

/** Gemini rejects the full attach/schedule JSON Schema as response_format.
 * Keep that schema in the prompt; constrain only the envelope on the wire. */
export const geminiProposalSchema = (
	schema: JsonSchemaObject,
): JsonSchemaObject => {
	const status = record(record(schema.properties).status);
	const operations = actionOperations(schema);
	return {
		type: "object",
		properties: {
			status: {
				type: "string",
				enum: Array.isArray(status.enum) ? status.enum : ["clarify", "answer"],
			},
			message: { type: "string" },
			actions: {
				type: "array",
				items: {
					type: "object",
					properties: {
						operation: operations.length
							? { type: "string", enum: operations }
							: { type: "string" },
						request: {
							type: "string",
							description:
								"JSON object for this operation's request. Match the operation request schema from the prompt.",
						},
					},
					required: ["operation", "request"],
				},
			},
			unsupported_obligations: {
				type: "array",
				items: {
					type: "object",
					properties: {
						obligation: { type: "string" },
						reason: { type: "string" },
					},
					required: ["obligation", "reason"],
				},
			},
		},
		required: ["status", "message", "actions", "unsupported_obligations"],
	};
};

export const renderProposalRequestSchemas = (
	schema: JsonSchemaObject,
): string => {
	const variants = actionVariants(schema);
	if (!variants.length) return "";
	return `Each actions[].request is a JSON object matching that operation's schema:\n${JSON.stringify(
		variants.map((variant) => ({
			operation: record(record(variant.properties).operation).enum,
			request: record(variant.properties).request,
		})),
	)}`;
};

const requestObject = (value: unknown): Record<string, unknown> => {
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			throw new Error("Action request is not valid JSON");
		}
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Action request must be a JSON object");
	return value as Record<string, unknown>;
};

const assertRequestFieldsPreserved = ({
	input,
	parsed,
	path,
}: {
	input: unknown;
	parsed: unknown;
	path: string;
}): void => {
	if (!input || typeof input !== "object") return;
	if (!parsed || typeof parsed !== "object") return;
	for (const [key, value] of Object.entries(input)) {
		const fieldPath = Array.isArray(input)
			? `${path}[${key}]`
			: `${path}.${key}`;
		if (!Object.hasOwn(parsed, key))
			throw new Error(
				`Unsupported request field was dropped by the schema: ${fieldPath}`,
			);
		assertRequestFieldsPreserved({
			input: value,
			parsed: (parsed as Record<string, unknown>)[key],
			path: fieldPath,
		});
	}
};

export const parseOperationPlan = ({
	output,
	allowedOperations,
	booleanFeatureIds = new Set<string>(),
}: {
	output: unknown;
	allowedOperations: string[];
	booleanFeatureIds?: ReadonlySet<string>;
}) => {
	const envelope = z
		.object({
			status: z.enum(["proposal", "clarify", "answer"]),
			message: z.string(),
			unsupported_obligations: z
				.array(
					z
						.object({
							obligation: z.string().min(1),
							reason: z.string().min(1),
						})
						.strict(),
				)
				.max(8)
				.default([]),
			actions: z
				.array(
					z
						.object({
							operation: operationSchema,
							request: z.union([z.record(z.unknown()), z.string()]),
						})
						.strict(),
				)
				.max(16),
		})
		.strict()
		.parse(output);
	if (envelope.status === "proposal" && envelope.actions.length === 0)
		throw new Error("Proposal status requires actions");
	if (envelope.status === "answer" && envelope.actions.length)
		throw new Error("Answer status must not carry actions");
	if (envelope.status === "clarify" && envelope.actions.length) {
		if (!envelope.unsupported_obligations.length)
			throw new Error(
				"A clarification only carries actions when it discloses unsupported obligations; otherwise return actions: []",
			);
		envelope.actions = [];
	}
	const actions: ToolCall[] = envelope.actions.map(({ operation, request }) => {
		if (!allowedOperations.includes(operation))
			throw new Error(`Operation not allowed: ${operation}`);
		const requestBody = requestObject(request);
		const parsed = schemaByTool[operation].parse(requestBody);
		assertRequestFieldsPreserved({
			input: requestBody,
			parsed,
			path: `${operation}.request`,
		});
		if (operation === "createSchedule") {
			const schedule = record(parsed);
			const plans = records(schedule.phases).flatMap((phase) =>
				records(phase.plans),
			);
			const scopes = new Set(
				plans.map((plan) =>
					plan.entity_id === undefined ? "inherit" : String(plan.entity_id),
				),
			);
			const [scope] = scopes;
			if (
				schedule.entity_id === undefined &&
				scopes.size === 1 &&
				typeof scope === "string" &&
				scope !== "inherit" &&
				scope !== "null"
			) {
				schedule.entity_id = scope;
				for (const plan of plans) delete plan.entity_id;
			}
		}
		const customizations =
			operation === "createSchedule"
				? records(record(parsed).phases).flatMap((phase) =>
						records(phase.plans).map((plan) => record(plan.customize)),
					)
				: [record(record(parsed).customize)];
		for (const customize of customizations) {
			for (const item of [
				...records(customize.add_items),
				...records(customize.items),
			]) {
				if (
					typeof item.feature_id === "string" &&
					booleanFeatureIds.has(item.feature_id) &&
					item.unlimited === undefined &&
					item.included === undefined
				)
					item.unlimited = true;
				if (typeof item.included === "number" && item.unlimited === undefined)
					item.unlimited = false;
				if (
					item.price &&
					typeof item.price === "object" &&
					record(item.price).max_purchase === undefined
				)
					record(item.price).max_purchase = null;
			}
		}
		return {
			name: operation,
			args: {
				request: parsed,
				intent: "Prepare the requested operation for explicit human approval",
			},
		};
	});
	return {
		status: envelope.status,
		message: envelope.message,
		actions,
		unsupportedObligations: envelope.unsupported_obligations,
	};
};

const previewSchema = z
	.object({
		customer_id: z.string(),
		currency: z.string().regex(/^[a-zA-Z]{3}$/),
		total: z.number().finite(),
	})
	.passthrough();

const checkPreviewValues = (value: unknown): void => {
	if (Array.isArray(value)) {
		value.forEach(checkPreviewValues);
		return;
	}
	for (const [key, child] of Object.entries(record(value))) {
		if (
			(key === "error" || key === "errors" || key === "isError") &&
			child &&
			(!Array.isArray(child) || child.length)
		)
			throw new Error("Preview contains an error");
		if (
			[
				"total",
				"subtotal",
				"amount",
				"amount_off",
				"starts_at",
				"effective_at",
			].includes(key) &&
			child !== null &&
			child !== undefined &&
			(typeof child !== "number" || !Number.isFinite(child))
		)
			throw new Error(`Invalid preview ${key}`);
		if (
			key === "currency" &&
			(typeof child !== "string" || !/^[a-zA-Z]{3}$/.test(child))
		)
			throw new Error("Invalid preview currency");
		if (child && typeof child === "object") checkPreviewValues(child);
	}
};

export const validateOperationPreview = ({
	call,
	preview,
}: {
	call: ToolCall;
	preview: unknown;
}) => {
	if (!["attach", "updateSubscription", "createSchedule"].includes(call.name))
		throw new Error(`No billing preview contract for ${call.name}`);
	const request = record(call.args.request);
	checkPreviewValues(preview);
	const result = previewSchema.parse(preview);
	if (result.customer_id !== request.customer_id)
		throw new Error("Preview customer does not match the proposal");
	if (
		result.entity_id !== undefined &&
		(result.entity_id ?? null) !== (request.entity_id ?? null)
	)
		throw new Error("Preview entity does not match the proposal");
	const changedPlans = [
		...records(result.incoming),
		...(call.name === "updateSubscription" ? records(result.outgoing) : []),
	].map((entry) => entry.plan_id);
	if (typeof request.plan_id === "string") {
		if (result.plan_id !== undefined && result.plan_id !== request.plan_id)
			throw new Error("Preview plan does not match the proposal");
		if (result.plan_id === undefined && !changedPlans.includes(request.plan_id))
			throw new Error("Preview does not confirm the proposed plan");
		if (
			records(result.incoming).length &&
			!changedPlans.includes(request.plan_id)
		)
			throw new Error("Preview incoming plan does not match the proposal");
	}
	if (call.name === "createSchedule") {
		const phases = records(request.phases);
		if (result.phases !== undefined && !Array.isArray(result.phases))
			throw new Error("Invalid preview schedule phases");
		const phasePreviews =
			result.phases !== undefined
				? records(result.phases)
				: records(result.line_items).some((item) => "starts_at" in item)
					? records(result.line_items)
					: undefined;
		if (phasePreviews) {
			if (phasePreviews.length !== phases.length)
				throw new Error("Preview schedule phase count does not match");
			phasePreviews.forEach((phase, index) => {
				if (
					typeof phases[index].starts_at === "number" &&
					phase.starts_at !== phases[index].starts_at
				)
					throw new Error("Preview schedule phase start does not match");
				if (
					phase.plans !== undefined &&
					JSON.stringify(
						records(phase.plans)
							.map((plan) => plan.plan_id)
							.sort(),
					) !==
						JSON.stringify(
							records(phases[index].plans)
								.map((plan) => plan.plan_id)
								.sort(),
						)
				)
					throw new Error("Preview schedule phase plans do not match");
			});
		}
		const expected = [
			...phases.flatMap((phase) => records(phase.plans)),
			...records(request.unscheduled_plans),
		].map((plan) => plan.plan_id);
		if (
			records(result.incoming).some((plan) => !expected.includes(plan.plan_id))
		)
			throw new Error("Preview schedule plan does not match");
	}
	return result;
};

const dateText = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value)
		? new Date(value).toISOString()
		: String(value);

export const renderOperation = ({
	call,
	preview,
	evidence,
}: {
	call: ToolCall;
	preview?: unknown;
	evidence: unknown;
}): string => {
	const request = record(call.args.request);
	const context = record(evidence);
	const facts = record(context.facts);
	const details = records(context.details);
	const related = [
		...records(context.pending),
		...records(context.completed),
	].map((entry) => ({
		call: record(entry.call ?? entry),
		result: record(entry.result),
	}));
	const createdCustomers: Record<string, unknown>[] = related
		.filter((entry) => entry.call.name === "getOrCreateCustomer")
		.map((entry) => {
			const request = record(record(entry.call.args).request);
			return { ...request, id: request.customer_id, ...entry.result };
		});
	const createdEntities: Record<string, unknown>[] = related
		.filter((entry) => entry.call.name === "createEntity")
		.map((entry) => {
			const request = record(record(entry.call.args).request);
			return { ...request, id: request.entity_id, ...entry.result };
		});
	const customers = [
		...records(record(facts.listCustomers).list),
		...details
			.filter((entry) => entry.name === "getCustomer")
			.map((entry) => record(entry.result)),
		...createdCustomers,
	];
	const plans = [
		...records(record(facts.listPlans).list),
		...details
			.filter((entry) => entry.name === "getPlan")
			.map((entry) => record(entry.result)),
	];
	const features = records(record(facts.listFeatures).list).map((feature) => ({
		...feature,
		id: String(feature.id),
		name: String(feature.name ?? feature.id),
	})) as PlanItemDisplayFeature[];
	const entities = [
		...details.flatMap((entry) =>
			entry.name === "listEntities"
				? records(record(entry.result).list)
				: entry.name === "getEntity"
					? [record(entry.result)]
					: [],
		),
		...createdEntities,
	];
	const customer = customers.find(
		(customer) => customer.id === request.customer_id,
	);
	const entity = entities.find(
		(entity) =>
			entity.id === request.entity_id &&
			(entity.customer_id === undefined ||
				entity.customer_id === request.customer_id),
	);
	const lines = [
		`Proposed ${call.name} for ${customer?.name ? `${customer.name} (${request.customer_id})` : request.customer_id}.`,
	];
	if (request.entity_id)
		lines.push(
			`Entity: ${entity?.name ?? record(request.entity_data).name ?? (call.name === "createEntity" ? request.name : undefined) ?? request.entity_id} (${request.entity_id}).`,
		);
	else if (
		["attach", "updateSubscription", "createSchedule"].includes(call.name)
	)
		lines.push("Scope: customer level.");
	if (request.subscription_id)
		lines.push(`Subscription: ${request.subscription_id}.`);
	const checked =
		preview === undefined
			? undefined
			: validateOperationPreview({ call, preview });
	const currency =
		typeof request.currency === "string"
			? request.currency
			: typeof checked?.currency === "string"
				? checked.currency
				: undefined;
	const describePlan = (entry: Record<string, unknown>) => {
		const plan = plans.find(
			(plan) =>
				plan.id === entry.plan_id &&
				(entry.version === undefined || plan.version === entry.version),
		);
		const customize = record(entry.customize);
		const price =
			"price" in customize ? customize.price : plan?.price;
		const display = getPlanDisplay({
			currency,
			features,
			plan: {
				plan_id: String(entry.plan_id),
				name: String(plan?.name ?? entry.plan_id),
				...(price ? { price } : {}),
				items: [],
			} as Parameters<typeof getPlanDisplay>[0]["plan"],
		});
		lines.push(
			`Plan: ${display.name} (${entry.plan_id})${entry.version === undefined ? "" : ` version ${entry.version}`}.${entry.entity_id !== undefined ? ` Scope: ${entry.entity_id ?? "customer level"}.` : ""}`,
		);
		if (price)
			lines.push(
				`Base price: ${display.basePriceText}${currency ? ` (${currency.toUpperCase()})` : " (catalog currency)"}.`,
			);
		else if (customize.price === null)
			lines.push("Base price removed; feature charges may still apply.");
		const planItems = records(customize.add_items ?? customize.items ?? []);
		for (const item of planItems) {
			const display = getPlanItemDisplay({
				currency,
				features,
				item: item as Parameters<typeof getPlanItemDisplay>[0]["item"],
			});
			lines.push(
				`${customize.items ? "Replacement item" : "Add / override"}: ${[display.primaryText, display.secondaryText, ...(display.details ?? [])].filter(Boolean).join("; ")}.`,
			);
		}
		for (const filter of records(customize.remove_items)) {
			const display = getPlanItemDisplay({
				currency,
				features,
				item: {
					feature_id: String(filter.feature_id ?? "all matching features"),
				},
			});
			lines.push(
				`Remove: ${display.primaryText}; matching ${JSON.stringify(filter)}.`,
			);
		}
		for (const quantity of records(entry.feature_quantities)) {
			const display = getPlanItemDisplay({
				currency,
				features,
				item: { feature_id: String(quantity.feature_id) },
			});
			lines.push(`${display.primaryText} quantity: ${quantity.quantity}.`);
		}
		const trial =
			"free_trial" in customize ? customize.free_trial : entry.free_trial;
		if (trial === null) lines.push("No free trial.");
		else if (trial) lines.push(`Free trial: ${JSON.stringify(trial)}.`);
		for (const key of [
			"update_items",
			"billing_controls",
			"upsert_licenses",
			"remove_licenses",
		])
			if (customize[key] !== undefined)
				lines.push(`${key}: ${JSON.stringify(customize[key])}.`);
	};
	if (request.plan_id) describePlan(request);
	for (const [index, phase] of records(request.phases).entries()) {
		lines.push(
			`Phase ${index + 1}: ${phase.starts_at !== undefined ? `starts ${dateText(phase.starts_at)}` : `starts ${record(phase.starting_after).duration_count} ${record(phase.starting_after).duration_type}(s) after the previous phase`}.`,
		);
		for (const plan of records(phase.plans)) describePlan(plan);
		if (phase.billing_cycle_anchor)
			lines.push(`Billing cycle anchor: ${phase.billing_cycle_anchor}.`);
	}
	for (const plan of records(request.unscheduled_plans)) {
		lines.push("Outside the schedule (not replaced by its phases):");
		describePlan(plan);
	}
	const cancellation: Record<string, string> = {
		cancel_immediately:
			"Cancel immediately after approval; any proration or refund follows the requested billing policy, not a confirmed payment.",
		cancel_end_of_cycle:
			"Cancel at the end of the current billing cycle, not immediately.",
		uncancel: "Reverse the pending cancellation.",
	};
	if (typeof request.cancel_action === "string")
		lines.push(cancellation[request.cancel_action] ?? request.cancel_action);
	if (request.proration_behavior)
		lines.push(`Proration policy: ${request.proration_behavior}.`);
	if (request.no_billing_changes === true)
		lines.push("No billing changes will be applied to Stripe.");
	for (const key of [
		"custom_line_items",
		"discounts",
		"refund_last_payment",
		"recalculate_balances",
		"carry_over_usages",
		"license_quantities",
	])
		if (request[key] !== undefined)
			lines.push(`${key}: ${JSON.stringify(request[key])}.`);
	const invoice = record(request.invoice_mode);
	if (invoice.enabled === true) {
		lines.push(
			invoice.finalize === false
				? "Create a draft invoice after approval; do not finalize it."
				: "Create and finalize an invoice after approval.",
		);
		if (invoice.net_terms_days)
			lines.push(
				`Payment terms: Net ${invoice.net_terms_days}, due ${invoice.net_terms_days} days after invoice finalization.`,
			);
	}
	if (
		request.enable_plan_immediately === true ||
		invoice.enable_plan_immediately === true
	)
		lines.push(
			"Enable access immediately when the approved operation executes, without waiting for invoice payment.",
		);
	if (request.redirect_mode === "always")
		lines.push(
			"Request a checkout URL after approval; checkout completion is not yet confirmed.",
		);
	else if (request.redirect_mode === "if_required")
		lines.push("Checkout may be required if payment action is needed.");
	else if (request.redirect_mode === "never")
		lines.push("Do not redirect to checkout.");
	if (request.billing_cycle_anchor !== undefined)
		lines.push(
			`Billing cycle anchor: ${dateText(request.billing_cycle_anchor)}.`,
		);
	if (
		["updateCustomer", "getOrCreateCustomer", "createEntity"].includes(
			call.name,
		)
	)
		lines.push(`Requested fields: ${JSON.stringify(request)}.`);
	if (checked)
		lines.push(
			"Preview identity checks passed. Preview totals are estimates, not a verified invoice amount or proof of payment.",
		);
	lines.push("Approval required; nothing in this proposal has been applied.");
	return lines.join("\n");
};
