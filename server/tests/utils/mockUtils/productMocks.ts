import { AppEnv, type FullProduct, type Price } from "@autumn/shared";

export const createMockProduct = () => ({
	id: "prod_test",
	name: "Test Product",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "test_group",
	env: AppEnv.Sandbox,
	internal_id: "prod_internal",
	org_id: "org_test",
	created_at: Date.now(),
	processor: null,
	base_variant_id: null,
	archived: false,
});

export const createMockFullProduct = ({
	prices,
}: {
	prices: Price[];
}): FullProduct =>
	({
		id: "prod_test",
		name: "Test Product",
		description: null,
		is_add_on: false,
		is_default: false,
		version: 1,
		group: "test_group",
		env: AppEnv.Sandbox,
		internal_id: "prod_internal",
		org_id: "org_test",
		created_at: Date.now(),
		processor: null,
		base_variant_id: null,
		archived: false,
		prices,
		entitlements: [],
		free_trial: null,
	}) as FullProduct;
