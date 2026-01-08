import { AppEnv, type FullProduct, type Price } from "@autumn/shared";

export const createMockProduct = ({
	id = "prod_test",
	stripeProductId,
}: {
	id?: string;
	stripeProductId?: string;
} = {}) => ({
	id,
	name: "Test Product",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "test_group",
	env: AppEnv.Sandbox,
	internal_id: `internal_${id}`,
	org_id: "org_test",
	created_at: Date.now(),
	processor: stripeProductId ? { type: "stripe", id: stripeProductId } : null,
	base_variant_id: null,
	archived: false,
});

export const createMockFullProduct = ({
	id = "prod_test",
	name = "Test Product",
	prices = [],
	stripeProductId,
	isAddOn = false,
}: {
	id?: string;
	name?: string;
	prices?: Price[];
	stripeProductId?: string;
	isAddOn?: boolean;
}): FullProduct =>
	({
		id,
		name,
		description: null,
		is_add_on: isAddOn,
		is_default: false,
		version: 1,
		group: "test_group",
		env: AppEnv.Sandbox,
		internal_id: `internal_${id}`,
		org_id: "org_test",
		created_at: Date.now(),
		processor: stripeProductId ? { type: "stripe", id: stripeProductId } : null,
		base_variant_id: null,
		archived: false,
		prices,
		entitlements: [],
		free_trial: null,
	}) as FullProduct;
