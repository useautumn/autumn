import type {
	EntitlementWithFeature,
	Feature,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
} from "@autumn/shared";

export interface CreditSystemSubRow {
	metered_feature_id: string;
	credit_amount: number;
	feature_amount: number;
	feature?: Feature;
	meteredCusEnt?: FullCusEntWithFullCusProduct;
	isSubRow: true;
	entitlement: EntitlementWithFeature;
	customer_product: FullCusProduct | null;
	next_reset_at: number | null;
}

export type CustomerFeatureUsageRowData =
	| CreditSystemSubRow
	| FullCusEntWithSubRows;

export type FullCusEntWithSubRows = FullCusEntWithFullCusProduct & {
	subRows?: CustomerFeatureUsageRowData[];
};
