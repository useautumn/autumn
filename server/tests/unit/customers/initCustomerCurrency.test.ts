import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomer } from "@/internal/customers/cusUtils/initCustomer.js";

const ctx = {
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
} as unknown as AutumnContext;

describe("initCustomer currency", () => {
	test("stores the requested currency lowercased", () => {
		const customer = initFullCustomer({
			ctx,
			customerId: "cus_1",
			customerData: { currency: "EUR" },
		});
		expect(customer.currency).toBe("eur");
	});

	test("leaves currency null when not provided", () => {
		const customer = initFullCustomer({
			ctx,
			customerId: "cus_1",
			customerData: {},
		});
		expect(customer.currency).toBeNull();
	});

	test("create_in_stripe does not force a currency", () => {
		const customer = initFullCustomer({
			ctx,
			customerId: "cus_1",
			customerData: { create_in_stripe: true },
		});
		expect(customer.currency).toBeNull();
	});
});
