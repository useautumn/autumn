import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomer } from "@/internal/customers/cusUtils/initCustomer.js";

const ctx = {
	org: { id: "org_1", config: {} },
	env: AppEnv.Sandbox,
} as unknown as AutumnContext;

describe("initCustomer config", () => {
	test("defaults to the column default when not provided", () => {
		const customer = initFullCustomer({
			ctx,
			customerId: "cus_1",
			customerData: {},
		});
		expect(customer.config).toEqual({});
	});

	test("keeps the requested config", () => {
		const customer = initFullCustomer({
			ctx,
			customerId: "cus_1",
			customerData: { config: { disable_pooled_balance: true } },
		});
		expect(customer.config).toEqual({ disable_pooled_balance: true });
	});
});
