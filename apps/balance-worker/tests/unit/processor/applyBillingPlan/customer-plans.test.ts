import { describe, expect, test } from "bun:test";
import {
	createCustomerPlans,
	runCustomerPlan,
} from "../../../../src/processor/commands/applyBillingPlan/customerPlans/customerPlans.js";

const gate = () => Promise.withResolvers<void>();

describe("customer plans", () => {
	test("a second plan of one customer starts only after the first settled", async () => {
		const customerPlans = createCustomerPlans();
		const order: string[] = [];
		const firstGate = gate();
		const first = runCustomerPlan({
			customerPlans,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				order.push("first:start");
				await firstGate.promise;
				order.push("first:end");
			},
		});
		const second = runCustomerPlan({
			customerPlans,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				order.push("second:start");
			},
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(order).toEqual(["first:start"]);
		firstGate.resolve();
		await Promise.all([first, second]);
		expect(order).toEqual(["first:start", "first:end", "second:start"]);
		expect(customerPlans.tails.size).toBe(0);
	});

	test("plans of different customers do not wait on each other", async () => {
		const customerPlans = createCustomerPlans();
		const adaGate = gate();
		const started: string[] = [];
		const ada = runCustomerPlan({
			customerPlans,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				started.push("ada");
				await adaGate.promise;
			},
		});
		await runCustomerPlan({
			customerPlans,
			customerKey: "org/sandbox/cus_bob",
			run: async () => {
				started.push("bob");
			},
		});
		expect(started).toEqual(["ada", "bob"]);
		adaGate.resolve();
		await ada;
	});

	test("a plan that fails still lets the next one run, and the failure reaches only its own caller", async () => {
		const customerPlans = createCustomerPlans();
		const failed = runCustomerPlan({
			customerPlans,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				throw new Error("insert refused");
			},
		});
		const next = runCustomerPlan({
			customerPlans,
			customerKey: "org/sandbox/cus_ada",
			run: async () => "created",
		});
		await expect(failed).rejects.toThrow("insert refused");
		expect(await next).toBe("created");
		expect(customerPlans.tails.size).toBe(0);
	});
});
