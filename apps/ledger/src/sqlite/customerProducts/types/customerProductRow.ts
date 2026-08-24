import type {
	ApiVersion,
	BillingVersion,
	CollectionMethod,
	CusProductStatus,
	FeatureOptions,
	Product,
} from "@autumn/shared";

// One active customer product as sqlite projects it: a FullCusProduct without
// the prices and entitlements the mirror does not store, which the store fills
// in as empty before handing back the model.
export type CustomerProductRow = {
	id: string;
	internal_customer_id: string;
	internal_product_id: string;
	internal_entity_id: string | null;
	entity_id: string | null;
	customer_id: string | null;
	product_id: string;
	created_at: number;
	updated_at: number | null;
	starts_at: number;
	status: CusProductStatus;
	canceled: boolean;
	collection_method: CollectionMethod;
	options: FeatureOptions[];
	quantity: number;
	is_custom: boolean;
	api_semver: ApiVersion | null;
	external_id: string | null;
	billing_version: BillingVersion;
	product: Product;
};
