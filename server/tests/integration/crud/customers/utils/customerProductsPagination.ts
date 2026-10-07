import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const sub1 = products.pro({
	id: "cpp-sub1",
	items: [items.monthlyMessages({ includedUsage: 10 })],
});
export const oneOff1 = products.oneOff({
	id: "cpp-oneoff1",
	items: [items.monthlyMessages({ includedUsage: 50 })],
});
export const oneOff2 = products.oneOff({
	id: "cpp-oneoff2",
	items: [items.monthlyMessages({ includedUsage: 75 })],
});
export const addOn = products.recurringAddOn({
	id: "cpp-addon",
	items: [items.monthlyMessages({ includedUsage: 30 })],
});

export const PRODUCT_COUNT = 4;

export const setupCustomer = async (customerId: string) =>
	initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [sub1, oneOff1, oneOff2, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: sub1.id }),
			s.billing.attach({ productId: oneOff1.id }),
			s.billing.attach({ productId: oneOff2.id }),
			s.billing.attach({ productId: addOn.id, newBillingSubscription: true }),
		],
	});

export const defaultParams = {
	start_cursor: "",
	limit: 10,
	status: "active" as const,
};
