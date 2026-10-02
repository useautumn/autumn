import { describe, expect, test } from "bun:test";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { findLinkedAddOnCustomerProduct } from "@/internal/billing/v2/actions/sync/setup/findLinkedAddOnCustomerProduct";

const STRIPE_SUBSCRIPTION_ID = "sub_target";
const addOn = products.createFull({ id: "bonus", isAddOn: true });

const unlinkedFreeAddOn = customerProducts.create({
	id: "cus_prod_free",
	productId: addOn.id,
	product: addOn,
});
const linkedAddOn = customerProducts.create({
	id: "cus_prod_linked",
	productId: addOn.id,
	product: addOn,
	subscriptionIds: [STRIPE_SUBSCRIPTION_ID],
	customerPrices: [
		prices.createCustomer({
			price: prices.createFixed({ id: "price_bonus" }),
			customerProductId: "cus_prod_linked",
		}),
	],
});

const findFor = (rows: (typeof linkedAddOn)[]) =>
	findLinkedAddOnCustomerProduct({
		fullCustomer: customers.create({ customerProducts: rows }),
		fullProduct: addOn,
		stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID,
	});

describe("findLinkedAddOnCustomerProduct", () => {
	test("prefers the instance on the subscription over an earlier customer-wide free one", () => {
		expect(findFor([unlinkedFreeAddOn, linkedAddOn])?.id).toBe(linkedAddOn.id);
	});

	test("falls back to a customer-wide free instance when none is on the subscription", () => {
		expect(findFor([unlinkedFreeAddOn])?.id).toBe(unlinkedFreeAddOn.id);
	});
});
