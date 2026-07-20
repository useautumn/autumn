import { expect, test } from "bun:test";
import {
	AppEnv,
	ProductItemInterval,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { productToLicenseCustomize } from "@/views/products/plan/components/plan-licenses/licenseCustomizeUtils";

const license: ProductV2 = {
	id: "dev-seat",
	name: "Dev Seat",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 1,
	group: null,
	env: AppEnv.Sandbox,
	free_trial: null,
	items: [
		{
			price: 20,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		},
	],
	created_at: 1,
};

test("builds a parent-link price diff without changing the base license", () => {
	const edited = productV2ToFrontendProduct({ product: license });
	edited.items = [
		{
			...edited.items[0],
			price: 200,
			interval: ProductItemInterval.Year,
		},
	];

	expect(
		productToLicenseCustomize({
			product: edited,
			license,
			features: [],
		}),
	).toEqual({
		price: { amount: 200, interval: ProductItemInterval.Year },
	});
	expect(license.items[0]).toMatchObject({
		price: 20,
		interval: ProductItemInterval.Month,
	});
});

test("returns null when an edit restores the base license", () => {
	expect(
		productToLicenseCustomize({
			product: productV2ToFrontendProduct({ product: license }),
			license,
			features: [],
		}),
	).toBeNull();
});

test("builds a parent-link diff for an added currency", () => {
	const edited = productV2ToFrontendProduct({ product: license });
	edited.items = [
		{
			...edited.items[0],
			additional_currencies: [{ currency: "gbp", amount: 18 }],
		},
	];

	expect(
		productToLicenseCustomize({
			product: edited,
			license,
			features: [],
		}),
	).toEqual({
		price: {
			amount: 20,
			interval: ProductItemInterval.Month,
			additional_currencies: [{ currency: "gbp", amount: 18 }],
		},
	});
});

test("reports an incomplete base price without leaking a Zod error", () => {
	const edited = productV2ToFrontendProduct({
		product: { ...license, items: [] },
	});
	edited.items = [
		{
			price: "" as unknown as number,
			interval: ProductItemInterval.Month,
			interval_count: 1,
		},
	];

	expect(() =>
		productToLicenseCustomize({
			product: edited,
			license,
			features: [],
		}),
	).toThrow("Enter a base price before saving");
});
