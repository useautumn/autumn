import { expect } from "bun:test";
import {
	type BillingInterval,
	type FullCustomerLicense,
	productToBasePrice,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

/**
 * Asserts the DB-side license definition behind a customer's pool: the parent
 * customer product (+ optional Stripe sub linkage) and the plan license the
 * pool anchors to — catalog (is_custom false) or custom, with its base price.
 */
export const expectLicenseDefinitionCorrect = async ({
	ctx,
	customerId,
	parentPlanId,
	subscriptionId,
	isCustom,
	basePrice,
}: {
	ctx: TestContext;
	customerId: string;
	parentPlanId: string;
	/** When set, the parent customer product must be linked to this Stripe sub. */
	subscriptionId?: string;
	isCustom: boolean;
	basePrice?: { amount: number; interval: BillingInterval };
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

	if (basePrice) {
		const planLicenseProduct = customerLicense?.planLicense?.product;
		const licenseBasePrice = planLicenseProduct
			? productToBasePrice({ product: planLicenseProduct })
			: null;
		expect(licenseBasePrice).not.toBeNull();
		expect(licenseBasePrice?.config.amount).toBe(basePrice.amount);
		expect(licenseBasePrice?.config.interval).toBe(basePrice.interval);
	}

	if (!customerLicense) {
		throw new Error(`Parent ${parentPlanId} has no customer license pool`);
	}
	return customerLicense;
};
