import type { CreditRateCard } from "@/internal/features/creditSystemUtils.js";

export type UsageAttributionDelta = {
	units: number;
	credits: number;
	rate_card: CreditRateCard;
};

export interface MutationLogItem {
	target_type: "customer_entitlement" | "rollover";
	customer_entitlement_id: string | null;
	rollover_id: string | null;
	entity_id: string | null;
	credit_cost: number;
	balance_delta: number;
	adjustment_delta: number;
	usage_delta: number;
	value_delta: number;
	usage_attribution_delta?: UsageAttributionDelta;
}
