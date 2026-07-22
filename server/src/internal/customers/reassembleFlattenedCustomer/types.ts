import type { CustomerProductsSeedRow } from "../cusUtils/buildCustomerProductsSeed.js";

export type FlattenedCustomerRow = {
	customers: any[];
	product_counts?: Record<string, number>;
	products_seed?: Record<string, CustomerProductsSeedRow[]>;
	customer_products: any[];
	customer_entitlements: any[];
	extra_customer_entitlements: any[];
	pooled_customer_entitlements: FlatCustomerEntitlement[];
	customer_prices: any[];
	entitlements: any[];
	rollovers: any[];
	replaceables: any[];
	free_trials: any[];
	subscriptions: any[];
	entities?: any[];
	invoices?: any[];
};

export type FlatCustomerEntitlement = {
	id: string;
	entitlement_id: string;
	internal_customer_id: string;
	customer_product_id: string | null;
	[k: string]: unknown;
};

export type FlatCustomerProduct = {
	id: string;
	internal_customer_id: string;
	free_trial_id: string | null;
	subscription_ids: string[] | null;
	product: { is_add_on?: boolean | null; [k: string]: unknown };
	status: string;
	created_at: number | string;
	[k: string]: unknown;
};

export type FlatRollover = { cus_ent_id: string; [k: string]: unknown };
export type FlatReplaceable = { cus_ent_id: string; [k: string]: unknown };
export type FlatCustomerPrice = {
	customer_product_id: string;
	[k: string]: unknown;
};
export type FlatEntitlement = { id: string; [k: string]: unknown };
export type FlatFreeTrial = { id: string; [k: string]: unknown };
export type FlatSubscription = { stripe_id: string; [k: string]: unknown };
