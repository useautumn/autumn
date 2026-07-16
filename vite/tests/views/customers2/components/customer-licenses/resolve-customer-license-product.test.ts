/**
 * Repointed license pools must render their customized product, not the catalog
 * product that originally defined the license.
 */
import { expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	type FullCustomer,
	type FullProduct,
	mapToProductV2,
	PriceType,
	productV2ToBasePrice,
} from "@autumn/shared";
import { resolveCustomerLicenseProduct } from "@/views/customers2/components/customer-licenses/resolveCustomerLicenseProduct";

const licenseProduct = ({ amount }: { amount: number }) =>
	({
		id: "dev-seat",
		internal_id: "prod_dev_seat",
		name: "Dev Seat",
		description: null,
		is_add_on: false,
		is_default: false,
		version: 1,
		group: "dev-seat",
		env: AppEnv.Sandbox,
		org_id: "org_test",
		created_at: 1,
		processor: null,
		base_variant_id: null,
		prices: [
			{
				id: `price_${amount}`,
				internal_product_id: "prod_dev_seat",
				entitlement_id: null,
				proration_config: null,
				config: {
					type: PriceType.Fixed,
					amount,
					interval: BillingInterval.Month,
				},
			},
		],
		entitlements: [],
		free_trial: null,
		free_trials: null,
		free_trial_ids: null,
	}) as FullProduct;

test("uses the repointed customer license product for display", () => {
	const catalogProduct = mapToProductV2({
		product: licenseProduct({ amount: 20 }),
	});
	const customProduct = licenseProduct({ amount: 80 });
	const customer = {
		customer_products: [
			{
				id: "cus_prod_parent",
				product: { id: "pro" },
				customer_licenses: [
					{
						id: "cus_lic_custom",
						parent_customer_product_id: "cus_prod_parent",
						planLicense: { product: customProduct },
					},
				],
			},
		],
	} as FullCustomer;

	const resolvedProduct = resolveCustomerLicenseProduct({
		customer,
		licensePlanId: "dev-seat",
		parentPlanId: "pro",
		catalogProduct,
	});
	expect(resolvedProduct).not.toBeNull();
	if (!resolvedProduct) throw new Error("Expected a resolved license product");

	expect(productV2ToBasePrice({ product: resolvedProduct })?.price).toBe(80);
});
