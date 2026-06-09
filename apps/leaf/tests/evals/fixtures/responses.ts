import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";

const planAmount = (plan: ApiPlanV1) => plan.price?.amount ?? 0;
const schedulePhases = (phases: unknown) =>
	Array.isArray(phases)
		? phases.map((phase, index) => {
				const record = phase as Record<string, unknown>;
				return {
					customer_product_ids: [`cp_schedule_${index + 1}`],
					phase_id: `phase_${index + 1}`,
					starts_at:
						typeof record.starts_at === "number" ? record.starts_at : null,
				};
			})
		: [];

export const responses = {
	attachPreview: ({
		customer,
		plan,
	}: {
		customer: BaseApiCustomerV5;
		plan: ApiPlanV1;
	}) => ({
		customer_id: customer.id,
		plan_id: plan.id,
		currency: "usd",
		line_items: [
			{ description: `${plan.name} annual`, total: planAmount(plan) },
		],
		total: planAmount(plan),
	}),
	attachSuccess: ({
		customer,
		plan,
	}: {
		customer: BaseApiCustomerV5;
		plan: ApiPlanV1;
	}) => ({
		customer_id: customer.id,
		plan_id: plan.id,
		status: "created",
	}),
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
			total: 0,
		})),
		total: 0,
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
};
