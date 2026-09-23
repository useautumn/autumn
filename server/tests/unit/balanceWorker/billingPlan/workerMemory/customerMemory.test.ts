import { describe, expect, test } from "bun:test";
import {
	createCustomerPlan,
	newCustomer,
	planOf,
	product,
} from "../billingPlanFixtures.js";
import {
	applyPlanToWorkerMemory,
	customerMemory,
	idsOf,
} from "./workerMemory.js";

const lockUsd = planOf({
	lockCustomerCurrency: {
		internalCustomerId: newCustomer.internal_id,
		currency: "usd",
	},
});

describe("customer facets in worker memory", () => {
	test("a create starts the customer from nothing, with its products, prices and grants, at revision 1", async () => {
		const plan = {
			...createCustomerPlan(),
			insertCustomerProducts: [product({ id: "cp_pro" })],
		};
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: plan,
			memory: { customer: null },
		});
		expect(customer.revision).toBe(1);
		expect(customer.identity.entityId).toBeNull();
		expect(customer.customer).toMatchObject({
			internal_id: newCustomer.internal_id,
			id: "cus_test",
			name: "Test Customer",
		});
		expect(idsOf(customer.customerProducts)).toEqual(["cp_pro"]);
		expect(idsOf(customer.customerPrices)).toEqual(["cus_price_cp_pro"]);
		expect(idsOf(customer.customerEntitlements)).toEqual(["grant_cp_pro"]);
	});

	test("a customer update changes only the columns it sets", async () => {
		const before = customerMemory({
			customerProducts: [product({ id: "cp_a" })],
		});
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomer: {
					customer: newCustomer,
					updates: { name: "Ada", email: null, processor: undefined },
				},
			}),
			memory: { customer: before },
		});
		expect(customer.customer).toEqual({
			...before.customer,
			name: "Ada",
			email: null,
		});
		expect(customer.customerProducts).toEqual(before.customerProducts);
		expect(customer.customerEntitlements).toEqual(before.customerEntitlements);
		expect(customer.revision).toBe(before.revision + 1);
	});

	test("a currency lock sets a null currency", async () => {
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: lockUsd,
			memory: {
				customer: customerMemory({
					customer: { ...newCustomer, currency: null },
				}),
			},
		});
		expect(customer.customer.currency).toBe("usd");
	});

	test("a currency lock sets a currency the row never had", async () => {
		const before = customerMemory();
		expect(before.customer).not.toHaveProperty("currency");
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: lockUsd,
			memory: { customer: before },
		});
		expect(customer.customer.currency).toBe("usd");
	});

	test("a currency lock leaves an existing currency alone and changes nothing", async () => {
		const before = customerMemory({
			customer: { ...newCustomer, currency: "eur" },
		});
		const { customer, mutation } = await applyPlanToWorkerMemory({
			autumnBillingPlan: lockUsd,
			memory: { customer: before },
		});
		expect(mutation?.changes).toEqual([]);
		expect(customer.customer).toEqual(before.customer);
	});

	test("a plan that writes nothing the worker holds is never sent, so memory is untouched", async () => {
		const before = customerMemory();
		const { customer, mutation } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({ lineItems: [] }),
			memory: { customer: before },
		});
		expect(mutation).toBeNull();
		expect(customer).toBe(before);
	});
});
