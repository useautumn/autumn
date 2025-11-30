import type {
	EntitlementWithFeature,
	Feature,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
} from "@autumn/shared";

/**
 * Represents a subrow in the customer feature usage table for credit system features.
 * Each subrow corresponds to a metered feature that consumes credits from the parent credit system.
 */
export interface CreditSystemSubRow {
	/** ID of the metered feature that consumes credits */
	metered_feature_id: string;
	/** Number of credits consumed per unit of the metered feature */
	credit_amount: number;
	/** Amount of the feature (from credit schema) */
	feature_amount: number;
	/** The metered feature details (looked up from features map) */
	feature?: Feature;
	/** The customer entitlement for this metered feature with usage data */
	meteredCusEnt?: FullCusEntWithFullCusProduct;
	/** Flag to identify this as a subrow */
	isSubRow: true;
	/** Parent entitlement (inherited for table context) */
	entitlement: EntitlementWithFeature;
	/** Parent customer product (inherited for table context) */
	customer_product: FullCusProduct;
	/** Parent reset timestamp (inherited for table context) */
	next_reset_at: number | null;
}

/**
 * Union type representing all possible row types in the customer feature usage table.
 * Used by TanStack Table to handle both parent rows and subrows.
 */
export type CustomerFeatureUsageRowData =
	| CreditSystemSubRow
	| FullCusEntWithSubRows;

/**
 * Extended version of FullCusEntWithFullCusProduct that includes optional subrows
 * for credit system features.
 */
export type FullCusEntWithSubRows = FullCusEntWithFullCusProduct & {
	subRows?: CustomerFeatureUsageRowData[];
};
