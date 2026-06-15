import type { BillingResponse } from "@api/billing/common/billingResponse.js";
import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";

const asRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);
const planAmount = (plan: ApiPlanV1) => plan.price?.amount ?? 0;
const amountFromCustomize = (value: unknown) => {
	const price = asRecord(asRecord(value).price);
	return typeof price.amount === "number" ? price.amount : 0;
};
const customLineItemsTotal = (value: unknown) =>
	asArray(asRecord(value).custom_line_items).reduce(
		(total, item) =>
			total +
			(typeof asRecord(item).amount === "number"
				? (asRecord(item).amount as number)
				: 0),
		0,
	);
const attachPreviewTotal = ({
	plan,
	request,
}: {
	plan: ApiPlanV1;
	request?: unknown;
}) =>
	customLineItemsTotal(request) ||
	amountFromCustomize(asRecord(request).customize) ||
	planAmount(plan);
const phaseTotal = (phase: unknown) =>
	asArray(asRecord(phase).plans).reduce(
		(total, plan) => total + amountFromCustomize(asRecord(plan).customize),
		0,
	);
const schedulePhases = (phases: unknown) =>
	Array.isArray(phases)
		? phases.map((phase, index) => {
				const record = phase as Record<string, unknown>;
				return {
					customer_product_ids: [`cp_schedule_${index + 1}`],
					phase_id: `phase_${index + 1}`,
					starts_at:
						typeof record.starts_at === "number" ? record.starts_at : null,
					total: phaseTotal(record),
				};
			})
		: [];

export const responses = {
	attachPreview: ({
		customer,
		plan,
		request,
	}: {
		customer: BaseApiCustomerV5;
		plan: ApiPlanV1;
		request?: unknown;
	}) => ({
		customer_id: customer.id,
		plan_id: plan.id,
		currency: "usd",
		line_items: [
			{
				description: `${plan.name} annual`,
				total: attachPreviewTotal({ plan, request }),
			},
		],
		total: attachPreviewTotal({ plan, request }),
	}),
	attachSuccess: ({
		customer,
		plan,
		request,
	}: {
		customer: BaseApiCustomerV5;
		plan: ApiPlanV1;
		request?: unknown;
	}) => ({
		customer_id: customer.id,
		// Mirrors the real billing response: a checkout URL comes back when the
		// caller forces a redirect; otherwise the field is null.
		payment_url:
			asRecord(request).redirect_mode === "always"
				? `https://checkout.example.com/cs_${customer.id}`
				: null,
		plan_id: plan.id,
		status: "created",
	}),
	// Mirrors the real BillingResponse when a charge is declined: no invoice,
	// payment_url null, required_action carries the failure code and reason.
	attachPaymentFailure: ({
		reason,
		request,
	}: {
		reason: string;
		request?: unknown;
	}): BillingResponse => {
		const body = asRecord(request);
		return {
			customer_id: typeof body.customer_id === "string" ? body.customer_id : "",
			...(typeof body.entity_id === "string"
				? { entity_id: body.entity_id }
				: {}),
			payment_url: null,
			required_action: { code: "payment_failed", reason },
		};
	},
	createSchedulePreview: ({
		customerId,
		phases,
	}: {
		customerId: string;
		phases: unknown;
	}) => ({
		customer_id: customerId,
		currency: "usd",
		line_items: schedulePhases(phases).map((phase, index) => ({
			description: `Schedule phase ${index + 1}`,
			starts_at: phase.starts_at,
			total: phase.total,
		})),
		total: schedulePhases(phases).reduce(
			(total, phase) => total + phase.total,
			0,
		),
	}),
	createScheduleSuccess: ({
		customerId,
		entityId = null,
		phases,
	}: {
		customerId: string;
		entityId?: string | null;
		phases: unknown;
	}) => ({
		customer_id: customerId,
		entity_id: entityId,
		invoice: null,
		payment_url: null,
		phases: schedulePhases(phases),
		schedule_id: `sched_${customerId}`,
		status: "created",
	}),
	updateSubscriptionPreview: ({
		customerId,
		planId,
		request,
	}: {
		customerId: string;
		planId: string;
		request?: unknown;
	}) => {
		const addedItems = asArray(asRecord(asRecord(request).customize).add_items);
		const dueToday = amountFromCustomize(asRecord(request).customize);
		return {
			customer_id: customerId,
			plan_id: planId,
			currency: "usd",
			added_items: addedItems,
			due_today: { total: dueToday },
			line_items: [],
			total: dueToday,
		};
	},
	updateSubscriptionSuccess: ({
		customerId,
		planId,
	}: {
		customerId: string;
		planId: string;
	}) => ({
		customer_id: customerId,
		plan_id: planId,
		invoice: null,
		payment_url: null,
		status: "updated",
	}),
};
