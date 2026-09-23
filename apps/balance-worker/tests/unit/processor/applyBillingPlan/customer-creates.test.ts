import { describe, expect, test } from "bun:test";
import {
	createCustomerCreates,
	runCustomerCreate,
} from "../../../../src/processor/commands/applyBillingPlan/createCustomer/customerCreates.js";

const gate = () => Promise.withResolvers<void>();

describe("customer creates", () => {
	test("a second create of one customer starts only after the first settled", async () => {
		const customerCreates = createCustomerCreates();
		const order: string[] = [];
		const firstGate = gate();
		const first = runCustomerCreate({
			customerCreates,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				order.push("first:start");
				await firstGate.promise;
				order.push("first:end");
			},
		});
		const second = runCustomerCreate({
			customerCreates,
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
		expect(customerCreates.tails.size).toBe(0);
	});

	test("creates of different customers do not wait on each other", async () => {
		const customerCreates = createCustomerCreates();
		const adaGate = gate();
		const started: string[] = [];
		const ada = runCustomerCreate({
			customerCreates,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				started.push("ada");
				await adaGate.promise;
			},
		});
		await runCustomerCreate({
			customerCreates,
			customerKey: "org/sandbox/cus_bob",
			run: async () => {
				started.push("bob");
			},
		});
		expect(started).toEqual(["ada", "bob"]);
		adaGate.resolve();
		await ada;
	});

	test("a create that fails still lets the next one run, and the failure reaches only its own caller", async () => {
		const customerCreates = createCustomerCreates();
		const failed = runCustomerCreate({
			customerCreates,
			customerKey: "org/sandbox/cus_ada",
			run: async () => {
				throw new Error("insert refused");
			},
		});
		const next = runCustomerCreate({
			customerCreates,
			customerKey: "org/sandbox/cus_ada",
			run: async () => "created",
		});
		await expect(failed).rejects.toThrow("insert refused");
		expect(await next).toBe("created");
		expect(customerCreates.tails.size).toBe(0);
	});
});
