import { describe, expect, test } from "bun:test";
import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	cusProductHasSubscription,
	customerProductHasSubscription,
	customerProductToEffectivePrices,
	type FullCustomerLicense,
	type FullPlanLicense,
	type FullProduct,
	isCustomerProductFree,
	isCustomerProductOneOff,
	isCustomerProductPaid,
	isCustomerProductPaidRecurring,
	isCustomerProductRecurring,
	isFreeProduct,
	isOneOffProduct,
	isProductPaidAndRecurring,
	productToEffectivePrices,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { handleStripeCheckoutErrors } from "@/internal/billing/v2/actions/attach/errors/handleStripeCheckoutErrors";
import { setupAttachCheckoutMode } from "@/internal/billing/v2/actions/attach/setup/setupAttachCheckoutMode";
import { oneOffOrAddOn } from "@/internal/products/productUtils/classifyProduct";

const withLicense = ({
	parent,
	licenseProduct,
	included = 5,
}: {
	parent: FullProduct;
	licenseProduct: FullProduct;
	included?: number;
}): FullProduct => ({
	...parent,
	licenses: [
		{
			id: `license_${licenseProduct.id}`,
			parent_internal_product_id: parent.internal_id,
			is_custom: false,
			license_internal_product_id: licenseProduct.internal_id,
			included,
			prepaid_only: false,
			customized: false,
			metadata: null,
			created_at: 1,
			updated_at: 1,
			product: licenseProduct,
		} satisfies FullPlanLicense,
	],
});

const customerLicense = ({
	planLicense,
	paidQuantity = 0,
}: {
	planLicense: FullPlanLicense | null;
	paidQuantity?: number;
}): FullCustomerLicense => ({
	id: "customer_license_1",
	link_id: "license_link_1",
	internal_customer_id: "cus_internal",
	parent_customer_product_id: "cus_prod_test",
	license_internal_product_id:
		planLicense?.license_internal_product_id ?? "removed_license",
	plan_license_id: planLicense?.id ?? null,
	granted: (planLicense?.included ?? 0) + paidQuantity,
	remaining: (planLicense?.included ?? 0) + paidQuantity,
	paid_quantity: paidQuantity,
	created_at: 1,
	updated_at: 1,
	planLicense,
});

describe("license-backed product classification", () => {
	test("classifies a free parent with a paid recurring license as paid recurring", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "recurring_license",
			prices: [prices.createFixed({ id: "license_monthly" })],
		});
		const product = withLicense({ parent, licenseProduct });

		expect(productToEffectivePrices({ product })).toEqual(
			licenseProduct.prices,
		);
		expect(isFreeProduct({ product })).toBe(false);
		expect(isOneOffProduct({ product })).toBe(false);
		expect(isProductPaidAndRecurring(product)).toBe(true);
		expect(isFreeProduct({ prices: parent.prices })).toBe(true);
	});

	test("classifies a free parent with a paid one-off license as one-off", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "one_off_license",
			prices: [prices.createOneOff({ id: "license_one_off" })],
		});
		const product = withLicense({ parent, licenseProduct });

		expect(isFreeProduct({ product })).toBe(false);
		expect(isOneOffProduct({ product })).toBe(true);
		expect(isProductPaidAndRecurring(product)).toBe(false);
		expect(oneOffOrAddOn({ product })).toBe(true);
	});

	test("keeps a parent with only free license prices free", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({ id: "free_license" });
		const product = withLicense({ parent, licenseProduct });

		expect(isFreeProduct({ product })).toBe(true);
		expect(isOneOffProduct({ product })).toBe(false);
		expect(isProductPaidAndRecurring(product)).toBe(false);
	});

	test("classifies a customer product from its license even at zero paid quantity", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "recurring_license",
			prices: [prices.createFixed({ id: "license_monthly" })],
		});
		const product = withLicense({ parent, licenseProduct });
		const customerProduct = {
			...customerProducts.create({
				product: parent,
				subscriptionIds: ["sub_123"],
			}),
			customer_licenses: [
				customerLicense({ planLicense: product.licenses![0]! }),
			],
		};

		expect(customerProductToEffectivePrices({ customerProduct })).toEqual(
			licenseProduct.prices,
		);
		expect(isCustomerProductFree(customerProduct)).toBe(false);
		expect(isCustomerProductPaid(customerProduct)).toBe(true);
		expect(isCustomerProductOneOff(customerProduct)).toBe(false);
		expect(isCustomerProductRecurring(customerProduct)).toBe(true);
		expect(isCustomerProductPaidRecurring(customerProduct)).toBe(true);
		expect(customerProductHasSubscription(customerProduct)).toBe(true);
		expect(cusProductHasSubscription({ cusProduct: customerProduct })).toBe(
			true,
		);
	});

	test("classifies a customer product with a one-off license as one-off", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "one_off_license",
			prices: [prices.createOneOff({ id: "license_one_off" })],
		});
		const product = withLicense({ parent, licenseProduct });
		const customerProduct = {
			...customerProducts.create({
				product: parent,
				subscriptionIds: ["sub_123"],
			}),
			customer_licenses: [
				customerLicense({ planLicense: product.licenses![0]! }),
			],
		};

		expect(isCustomerProductFree(customerProduct)).toBe(false);
		expect(isCustomerProductPaid(customerProduct)).toBe(true);
		expect(isCustomerProductOneOff(customerProduct)).toBe(true);
		expect(isCustomerProductRecurring(customerProduct)).toBe(false);
		expect(isCustomerProductPaidRecurring(customerProduct)).toBe(false);
		expect(customerProductHasSubscription(customerProduct)).toBe(false);
	});

	test("uses Stripe Checkout for a paid license-backed plan without a card", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "recurring_license",
			prices: [prices.createFixed({ id: "license_monthly" })],
		});
		const attachProduct = withLicense({ parent, licenseProduct });

		expect(
			setupAttachCheckoutMode({
				attachProduct,
				redirectMode: "if_required",
			}),
		).toBe("stripe_checkout");
	});

	test("rejects Stripe Checkout without a paid license quantity", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "recurring_license",
			prices: [prices.createFixed({ id: "license_monthly" })],
		});
		const attachProduct = withLicense({ parent, licenseProduct });
		const newCustomerProduct = {
			...customerProducts.create({ product: parent }),
			customer_licenses: [
				customerLicense({ planLicense: attachProduct.licenses![0]! }),
			],
		};

		expect(() =>
			handleStripeCheckoutErrors({
				billingContext: {
					attachProduct,
					currentCustomerProduct: undefined,
					checkoutMode: "stripe_checkout",
				} as AttachBillingContext,
				autumnBillingPlan: {
					insertCustomerProducts: [newCustomerProduct],
				} as AutumnBillingPlan,
			}),
		).toThrow("requires at least one license quantity above");
	});

	test("allows direct billing without a paid license quantity", () => {
		const parent = products.createFull({ id: "free_parent" });
		const licenseProduct = products.createFull({
			id: "recurring_license",
			prices: [prices.createFixed({ id: "license_monthly" })],
		});
		const attachProduct = withLicense({ parent, licenseProduct });

		expect(() =>
			handleStripeCheckoutErrors({
				billingContext: {
					attachProduct,
					currentCustomerProduct: undefined,
					checkoutMode: null,
				} as AttachBillingContext,
				autumnBillingPlan: {} as AutumnBillingPlan,
			}),
		).not.toThrow();
	});
});
