import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";

const planAmount = (plan: ApiPlanV1) => plan.price?.amount ?? 0;

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
};
