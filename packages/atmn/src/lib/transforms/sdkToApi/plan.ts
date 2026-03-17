import type { Plan, PlanItem } from "../../../compose/models/index.js";

/**
 * API plan format expected by the server's CreatePlanParams schema
 */
export interface ApiPlanParams {
	id: string;
	name: string;
	description?: string | null;
	group?: string;
	add_on?: boolean;
	auto_enable?: boolean;
	price?: {
		amount: number;
		interval: string;
	};
	items?: ApiPlanItemParams[];
	free_trial?: {
		duration_type: string;
		duration_length: number;
		card_required: boolean;
	};
}

export interface ApiPlanItemParams {
	feature_id: string;
	included?: number;
	unlimited?: boolean;
	reset?: {
		interval: string;
		interval_count?: number;
	};
	price?: {
		amount?: number;
		tiers?: Array<{ to: number | "inf"; amount: number; flat_amount?: number }>;
		interval: string;
		interval_count?: number;
		billing_units?: number;
		billing_method: string;
		max_purchase?: number;
		tier_behavior?: string;
	};
	proration?: {
		on_increase: string;
		on_decrease: string;
	};
	rollover?: {
		max: number;
		expiry_duration_type: string;
		expiry_duration_length?: number;
	};
}

/**
 * Transform SDK PlanItem to API format
 *
 * Handles mutually exclusive reset patterns:
 * - SDK top-level reset -> API reset.interval
 * - SDK price.interval -> API price.interval
 */
function transformPlanItem(planItem: PlanItem): ApiPlanItemParams {
	const result: ApiPlanItemParams = {
		feature_id: planItem.featureId,
	};

	if (planItem.included !== undefined) {
		result.included = planItem.included;
	}

	if (planItem.unlimited !== undefined) {
		result.unlimited = planItem.unlimited;
	}

	// Top-level reset (for features without price.interval)
	if (planItem.reset) {
		result.reset = {
			interval: planItem.reset.interval,
			...(planItem.reset.intervalCount !== undefined && {
				interval_count: planItem.reset.intervalCount,
			}),
		};
	}

	if (planItem.price) {
		// Get interval from price.interval if available, otherwise from top-level reset
		const priceWithInterval = planItem.price as {
			interval?: string;
			intervalCount?: number;
		};
		const priceInterval = priceWithInterval.interval;
		const priceIntervalCount = priceWithInterval.intervalCount;
		const interval = priceInterval ?? planItem.reset?.interval;
		const intervalCount = priceIntervalCount ?? planItem.reset?.intervalCount;

		const priceWithBilling = planItem.price as {
			billingUnits?: number;
			billingMethod?: string;
			maxPurchase?: number;
			tierBehavior?: string;
		};

		result.price = {
			interval: interval!,
			billing_units: priceWithBilling.billingUnits ?? 1,
			billing_method: priceWithBilling.billingMethod ?? "prepaid",
			...(planItem.price.amount !== undefined && {
				amount: planItem.price.amount,
			}),
			...(planItem.price.tiers && {
				tiers: planItem.price.tiers.map((tier) => {
					const t = tier as { to: number | "inf"; amount: number; flatAmount?: number };
					return {
						to: t.to,
						amount: t.amount,
						...(t.flatAmount !== undefined && { flat_amount: t.flatAmount }),
					};
				}),
			}),
			...(intervalCount !== undefined && {
				interval_count: intervalCount,
			}),
			...(priceWithBilling.maxPurchase !== undefined && {
				max_purchase: priceWithBilling.maxPurchase,
			}),
			...(priceWithBilling.tierBehavior !== undefined && {
				tier_behavior: priceWithBilling.tierBehavior,
			}),
		};
	}

	if (planItem.proration) {
		result.proration = {
			on_increase: planItem.proration.onIncrease,
			on_decrease: planItem.proration.onDecrease,
		};
	}

	if (planItem.rollover) {
		result.rollover = {
			// API expects number, SDK allows null (treat null as 0 or very large number)
			max: planItem.rollover.max ?? 0,
			expiry_duration_type: planItem.rollover.expiryDurationType,
			...(planItem.rollover.expiryDurationLength !== undefined && {
				expiry_duration_length: planItem.rollover.expiryDurationLength,
			}),
		};
	}

	return result;
}

/**
 * Transform SDK Plan to API format for has_customers endpoint
 */
export function transformPlanToApi(plan: Plan): ApiPlanParams {
	const result: ApiPlanParams = {
		id: plan.id,
		name: plan.name,
	};

	if (plan.description !== undefined) {
		result.description = plan.description;
	}

	if (plan.group !== undefined) {
		result.group = plan.group;
	}

	if (plan.addOn !== undefined) {
		result.add_on = plan.addOn;
	}

	if (plan.autoEnable !== undefined) {
		result.auto_enable = plan.autoEnable;
	}

	if (plan.price) {
		result.price = {
			amount: plan.price.amount,
			interval: plan.price.interval,
		};
	}

	if (plan.items && plan.items.length > 0) {
		result.items = plan.items.map(transformPlanItem);
	}

	if (plan.freeTrial) {
		result.free_trial = {
			duration_type: plan.freeTrial.durationType,
			duration_length: plan.freeTrial.durationLength,
			card_required: plan.freeTrial.cardRequired,
		};
	}

	return result;
}
