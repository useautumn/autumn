import { expect } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";

/** Pro on subscription A, a recurring seats add-on on subscription B, plus a customer-wide free add-on. */
export const initMultiSubScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const seats = products.recurringAddOn({
		id: "seats",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});
	const monthlyAddOn = products.recurringAddOn({
		id: "monthly-addon",
		items: [items.monthlyWords({ includedUsage: 50 })],
	});
	const annualAddOn = products.base({
		id: "annual-addon",
		isAddOn: true,
		items: [items.annualPrice({ price: 200 })],
	});
	const freeAddOn = products.base({
		id: "free-addon",
		isAddOn: true,
		items: [items.monthlyWords({ includedUsage: 10 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [pro, premium, seats, monthlyAddOn, annualAddOn, freeAddOn],
			}),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: seats.id, newBillingSubscription: true }),
			s.billing.attach({ productId: freeAddOn.id }),
		],
	});

	const subscriptionA = await getSubscriptionId({
		ctx: scenario.ctx,
		customerId,
		productId: pro.id,
	});
	const subscriptionB = await getSubscriptionId({
		ctx: scenario.ctx,
		customerId,
		productId: seats.id,
	});
	expect(subscriptionA).not.toBe(subscriptionB);

	return {
		...scenario,
		subscriptionA,
		subscriptionB,
		plans: { pro, premium, seats, monthlyAddOn, annualAddOn, freeAddOn },
	};
};

export const fetchLiveCustomerProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === productId,
	);
};
