import { expect } from "bun:test";
import {
	type BillingInterval,
	type FullCustomerLicense,
	productToBasePrice,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

/** Asserts the customer pool's parent product and effective license definition. */
export const expectLicenseDefinitionCorrect = async ({
	ctx,
	customerId,
	parentPlanId,
	subscriptionId,
	isCustom,
	isCustomized,
	basePrice,
}: {
	ctx: TestContext;
	customerId: string;
	parentPlanId: string;
	/** When set, the parent customer product must be linked to this Stripe sub. */
	subscriptionId?: string;
	isCustom: boolean;
	isCustomized?: boolean;
	basePrice?: {
		amount: number;
		interval: BillingInterval;
		isCustom?: boolean;
		stripeProductId?: string;
	};
}): Promise<FullCustomerLicense> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});

	const parentCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product_id === parentPlanId,
	);
	expect(
		parentCustomerProduct,
		`Customer has no ${parentPlanId} customer product`,
	).toBeDefined();
	if (subscriptionId) {
		expect(parentCustomerProduct?.subscription_ids).toContain(subscriptionId);
	}

	const customerLicense = parentCustomerProduct?.customer_licenses?.[0];
	expect(
		customerLicense,
		`Parent ${parentPlanId} has no customer license pool`,
	).toBeDefined();
	expect(customerLicense?.planLicense?.is_custom).toBe(isCustom);
	if (isCustomized !== undefined) {
		expect(customerLicense?.planLicense?.customized).toBe(isCustomized);
	}

	if (basePrice) {
		const planLicenseProduct = customerLicense?.planLicense?.product;
		const licenseBasePrice = planLicenseProduct
			? productToBasePrice({ product: planLicenseProduct })
			: null;
		expect(licenseBasePrice).not.toBeNull();
		expect(licenseBasePrice?.config.amount).toBe(basePrice.amount);
		expect(licenseBasePrice?.config.interval).toBe(basePrice.interval);
		if (basePrice.isCustom !== undefined) {
			expect(licenseBasePrice?.is_custom).toBe(basePrice.isCustom);
		}
		if (basePrice.stripeProductId) {
			expect(licenseBasePrice?.config.stripe_product_id).toBe(
				basePrice.stripeProductId,
			);
			expect(licenseBasePrice?.config.stripe_price_id).toBeDefined();
			const stripePrice = await ctx.stripeCli.prices.retrieve(
				licenseBasePrice!.config.stripe_price_id!,
			);
			const actualStripeProductId =
				typeof stripePrice.product === "string"
					? stripePrice.product
					: stripePrice.product.id;
			expect(actualStripeProductId).toBe(basePrice.stripeProductId);
		}
	}

	if (!customerLicense) {
		throw new Error(`Parent ${parentPlanId} has no customer license pool`);
	}
	return customerLicense;
};
