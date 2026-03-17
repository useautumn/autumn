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
}
